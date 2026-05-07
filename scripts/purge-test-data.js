require('dotenv').config();

const { Pool } = require('pg');

const EMAIL_PATTERNS = [
  /@example\.com$/i,
  /@ivorycapital\.test$/i,
  /(^|[._+-])(test|tester|demo|preview)([._+-]|@|$)/i
];

const NAME_PATTERNS = /\b(test|tester|demo|preview)\b/i;

function toNumber(value) {
  return Number(value || 0);
}

function getMatchReasons(user) {
  const reasons = [];
  const email = String(user.email || '');
  const fullName = [user.first_name, user.last_name].filter(Boolean).join(' ');

  EMAIL_PATTERNS.forEach(function checkPattern(pattern) {
    if (pattern.test(email)) {
      reasons.push('email:' + pattern);
    }
  });

  if (NAME_PATTERNS.test(fullName)) {
    reasons.push('name:test-marker');
  }

  return reasons;
}

async function readUsers(client) {
  const result = await client.query(`
    SELECT
      u.id,
      u.email,
      u.first_name,
      u.last_name,
      u.created_at,
      p.total_balance,
      p.available_cash,
      p.active_investments,
      p.protected_reserves,
      COALESCE(tx.tx_count, 0)::int AS tx_count,
      COALESCE(nt.notification_count, 0)::int AS notification_count,
      COALESCE(w.wallet_count, 0)::int AS wallet_count,
      COALESCE(a.allocation_count, 0)::int AS allocation_count
    FROM public.ivory_users u
    LEFT JOIN public.ivory_account_profiles p
      ON p.user_id = u.id
    LEFT JOIN (
      SELECT user_id, COUNT(*)::int AS tx_count
      FROM public.ivory_transactions
      GROUP BY user_id
    ) tx
      ON tx.user_id = u.id
    LEFT JOIN (
      SELECT user_id, COUNT(*)::int AS notification_count
      FROM public.ivory_notifications
      GROUP BY user_id
    ) nt
      ON nt.user_id = u.id
    LEFT JOIN (
      SELECT user_id, COUNT(*)::int AS wallet_count
      FROM public.ivory_wallet_balances
      GROUP BY user_id
    ) w
      ON w.user_id = u.id
    LEFT JOIN (
      SELECT user_id, COUNT(*)::int AS allocation_count
      FROM public.ivory_portfolio_allocations
      GROUP BY user_id
    ) a
      ON a.user_id = u.id
    ORDER BY u.id
  `);

  return result.rows.map(function mapUser(row) {
    return {
      id: Number(row.id),
      email: row.email,
      first_name: row.first_name,
      last_name: row.last_name,
      created_at: row.created_at,
      total_balance: toNumber(row.total_balance),
      available_cash: toNumber(row.available_cash),
      active_investments: toNumber(row.active_investments),
      protected_reserves: toNumber(row.protected_reserves),
      tx_count: Number(row.tx_count || 0),
      notification_count: Number(row.notification_count || 0),
      wallet_count: Number(row.wallet_count || 0),
      allocation_count: Number(row.allocation_count || 0)
    };
  });
}

async function deleteUsers(client, userIds) {
  if (!userIds.length) {
    return [];
  }

  const deleted = await client.query(
    'DELETE FROM public.ivory_users WHERE id = ANY($1::bigint[]) RETURNING id, email',
    [userIds]
  );

  return deleted.rows.map(function mapDeleted(row) {
    return {
      id: Number(row.id),
      email: row.email
    };
  });
}

async function readTableCounts(client) {
  const result = await client.query(`
    SELECT
      (SELECT COUNT(*)::int FROM public.ivory_users) AS user_count,
      (SELECT COUNT(*)::int FROM public.ivory_transactions) AS transaction_count,
      (SELECT COUNT(*)::int FROM public.ivory_notifications) AS notification_count,
      (SELECT COUNT(*)::int FROM public.ivory_wallet_balances) AS wallet_count,
      (SELECT COUNT(*)::int FROM public.ivory_portfolio_allocations) AS allocation_count,
      (SELECT COUNT(*)::int FROM public.ivory_account_profiles) AS profile_count,
      (SELECT COUNT(*)::int FROM public.ivory_kyc_records) AS kyc_count
  `);

  return result.rows[0];
}

async function main() {
  const apply = process.argv.includes('--apply');
  const pool = new Pool();

  try {
    const client = await pool.connect();

    try {
      const users = await readUsers(client);
      const candidates = users
        .map(function withReasons(user) {
          return Object.assign({}, user, { reasons: getMatchReasons(user) });
        })
        .filter(function isCandidate(user) {
          return user.reasons.length > 0;
        });

      if (!apply) {
        console.log(JSON.stringify({
          mode: 'dry-run',
          userCount: users.length,
          candidates: candidates
        }, null, 2));
        return;
      }

      await client.query('BEGIN');
      const deletedUsers = await deleteUsers(client, candidates.map(function getId(user) {
        return user.id;
      }));
      const remaining = await readTableCounts(client);
      await client.query('COMMIT');

      console.log(JSON.stringify({
        mode: 'apply',
        deletedUsers: deletedUsers,
        remaining: remaining
      }, null, 2));
    } catch (error) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackError) {
        console.error('Rollback failed:', rollbackError);
      }
      throw error;
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }
}

main().catch(function onError(error) {
  console.error(error);
  process.exit(1);
});