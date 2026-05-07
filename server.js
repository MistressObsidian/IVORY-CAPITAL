require('dotenv').config();

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');

const app = express();
const port = Number(process.env.PORT || 3000);
const rootDir = __dirname;
const schemaPath = path.join(rootDir, 'database', 'schema.sql');
const neonApiUrl = String(process.env.NEON_API_URL || '').trim();
const neonAuthUrl = String(process.env.NEON_AUTH_URL || '').trim();
const neonJwksUrl = String(process.env.NEON_JWKS_URL || '').trim();

const pool = new Pool({
  host: process.env.PGHOST,
  database: process.env.PGDATABASE,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  ssl: process.env.PGSSLMODE === 'require' ? { rejectUnauthorized: false } : false,
  max: 10,
  idleTimeoutMillis: 30_000
});

async function ensureSchema() {
  const sql = fs.readFileSync(schemaPath, 'utf8');
  await pool.query(sql);
}

function publicUser(record) {
  return {
    id: record.id,
    firstName: record.first_name,
    lastName: record.last_name,
    email: record.email,
    country: record.country,
    createdAt: record.created_at
  };
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function toNumber(value) {
  return Number(value || 0);
}

const SUPPORTED_ASSETS = {
  BTC: {
    assetName: 'Bitcoin',
    network: 'Bitcoin',
    fallbackUsdPerUnit: 60000,
    walletSuffix: 'PRIMARY'
  },
  ETH: {
    assetName: 'Ethereum',
    network: 'Ethereum',
    fallbackUsdPerUnit: 3000,
    walletSuffix: 'FLOW'
  },
  USDT: {
    assetName: 'Tether',
    network: 'TRC20',
    fallbackUsdPerUnit: 1,
    walletSuffix: 'SAFE'
  }
};

const STRATEGY_LANES = {
  'Core Growth': {
    riskProfile: 'Balanced',
    miningBoost: 0.00002,
    allocations: {
      'Bitcoin Reserve': 44,
      'Ethereum Growth': 24,
      'Stable Reserves': 16,
      'FX / Macro': 16
    }
  },
  'Accelerated Yield': {
    riskProfile: 'Growth',
    miningBoost: 0.00004,
    allocations: {
      'Bitcoin Reserve': 32,
      'Ethereum Growth': 36,
      'Stable Reserves': 14,
      'FX / Macro': 18
    }
  },
  'Income Reserve': {
    riskProfile: 'Moderate',
    miningBoost: 0.000015,
    allocations: {
      'Bitcoin Reserve': 28,
      'Ethereum Growth': 18,
      'Stable Reserves': 38,
      'FX / Macro': 16
    }
  }
};

function normalizeAssetCode(value) {
  return String(value || '').trim().toUpperCase();
}

function normalizeStrategyLane(value) {
  return String(value || '').trim();
}

function toCurrencyAmount(value) {
  var numeric = Number(value);

  if (!Number.isFinite(numeric)) {
    return NaN;
  }

  return Number(numeric.toFixed(2));
}

function formatCurrencyMessage(value) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2
  }).format(Number(value || 0));
}

function getNeonIntegrationConfig() {
  return {
    databaseConnected: true,
    apiUrl: neonApiUrl || null,
    authUrl: neonAuthUrl || null,
    jwksUrl: neonJwksUrl || null,
    neonAuthConfigured: Boolean(neonAuthUrl && neonJwksUrl),
    authMode: neonAuthUrl ? 'neon-auth-configured' : 'database-local-bridge'
  };
}

function createReferenceCode(prefix) {
  return 'IC-' + prefix + '-' + new Date().toISOString().slice(2, 10).replace(/-/g, '') + '-' + crypto.randomBytes(3).toString('hex').toUpperCase();
}

function toInteger(value) {
  var numeric = Number(value || 0);
  return Number.isInteger(numeric) ? numeric : 0;
}

function mapTransactionRow(row) {
  return {
    id: toInteger(row.id),
    referenceCode: row.reference_code || null,
    assetCode: row.asset_code,
    entryType: row.entry_type,
    status: row.status,
    amount: toNumber(row.amount),
    destinationReference: row.destination_reference || null,
    notes: row.notes || null,
    approvedAt: row.approved_at || null,
    createdAt: row.created_at
  };
}

function mapNotificationRow(row) {
  return {
    id: toInteger(row.id),
    referenceCode: row.reference_code || null,
    category: row.category,
    title: row.title,
    body: row.body,
    isUnread: row.is_unread,
    readAt: row.read_at || null,
    relatedTransactionId: row.related_transaction_id ? toInteger(row.related_transaction_id) : null,
    createdAt: row.created_at
  };
}

function summarizeOperations(transactions, notifications) {
  return {
    pendingWithdrawals: transactions.filter(function (transaction) {
      return transaction.entryType === 'Withdrawal' && transaction.status === 'Review';
    }).length,
    unreadNotifications: notifications.filter(function (notification) {
      return notification.isUnread;
    }).length,
    lastReference: transactions.length ? transactions[0].referenceCode : null
  };
}

function buildActivityPayload(transactionRow, notificationRow) {
  return {
    transaction: transactionRow ? mapTransactionRow(transactionRow) : null,
    notification: notificationRow ? mapNotificationRow(notificationRow) : null
  };
}

function getSupportedAsset(assetCode) {
  return SUPPORTED_ASSETS[assetCode] || null;
}

function getStrategyConfig(strategyLane) {
  return STRATEGY_LANES[strategyLane] || null;
}

function buildWalletAddress(userId, assetCode) {
  var asset = getSupportedAsset(assetCode);

  if (!asset) {
    return null;
  }

  return 'IC-' + assetCode + '-' + String(userId).padStart(4, '0') + '-' + asset.walletSuffix;
}

async function getUserRecordById(userId) {
  var result = await pool.query('SELECT id, first_name, last_name, email, country, created_at FROM public.ivory_users WHERE id = $1', [userId]);
  return result.rows[0] || null;
}

async function createTransactionRecord(client, options) {
  var referenceCode = options.referenceCode || createReferenceCode('TXN');
  var createdAt = options.createdAt || new Date();
  var approvedAt = options.approvedAt || (options.status === 'Approved' ? createdAt : null);
  var result = await client.query(
    'INSERT INTO public.ivory_transactions (user_id, asset_code, entry_type, status, amount, reference_code, destination_reference, notes, approved_at, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id, reference_code, asset_code, entry_type, status, amount, destination_reference, notes, approved_at, created_at',
    [
      options.userId,
      options.assetCode,
      options.entryType,
      options.status,
      options.amount,
      referenceCode,
      options.destinationReference || null,
      options.notes || null,
      approvedAt,
      createdAt
    ]
  );

  return result.rows[0];
}

async function createNotificationRecord(client, options) {
  var referenceCode = options.referenceCode || createReferenceCode('NTF');
  var createdAt = options.createdAt || new Date();
  var isUnread = options.isUnread !== false;
  var readAt = options.readAt || (isUnread ? null : createdAt);
  var result = await client.query(
    'INSERT INTO public.ivory_notifications (user_id, category, title, body, is_unread, reference_code, read_at, related_transaction_id, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id, reference_code, category, title, body, is_unread, read_at, related_transaction_id, created_at',
    [
      options.userId,
      options.category,
      options.title,
      options.body,
      isUnread,
      referenceCode,
      readAt,
      options.relatedTransactionId || null,
      createdAt
    ]
  );

  return result.rows[0];
}

async function applyWalletUsdDelta(client, userId, assetCode, usdDelta) {
  var asset = getSupportedAsset(assetCode);
  var walletResult;
  var wallet;
  var currentUsd;
  var currentBalance;
  var nextUsd;
  var nextBalance;
  var unitsPerUsd;
  var precision;

  if (!asset) {
    throw new Error('Unsupported asset selected.');
  }

  walletResult = await client.query(
    'SELECT id, asset_code, asset_name, network, wallet_address, balance, usd_value FROM public.ivory_wallet_balances WHERE user_id = $1 AND asset_code = $2 FOR UPDATE',
    [userId, assetCode]
  );
  wallet = walletResult.rows[0] || null;
  currentUsd = wallet ? toNumber(wallet.usd_value) : 0;
  currentBalance = wallet ? toNumber(wallet.balance) : 0;

  if (!wallet && usdDelta < 0) {
    throw new Error(assetCode + ' wallet funding is not available yet.');
  }

  if (wallet && currentUsd + usdDelta < -0.001) {
    throw new Error(assetCode + ' wallet balance is too low for this action.');
  }

  unitsPerUsd = currentUsd > 0 && currentBalance > 0
    ? currentBalance / currentUsd
    : 1 / asset.fallbackUsdPerUnit;
  precision = assetCode === 'USDT' ? 2 : 6;
  nextUsd = Number((currentUsd + usdDelta).toFixed(2));
  nextBalance = Number((currentBalance + usdDelta * unitsPerUsd).toFixed(precision));

  if (nextUsd < 0) {
    nextUsd = 0;
  }

  if (nextBalance < 0) {
    nextBalance = 0;
  }

  if (wallet) {
    await client.query(
      'UPDATE public.ivory_wallet_balances SET balance = $3, usd_value = $4 WHERE id = $1 AND user_id = $2',
      [wallet.id, userId, nextBalance, nextUsd]
    );
  } else {
    await client.query(
      'INSERT INTO public.ivory_wallet_balances (user_id, asset_code, asset_name, network, wallet_address, balance, usd_value) VALUES ($1, $2, $3, $4, $5, $6, $7)',
      [userId, assetCode, asset.assetName, asset.network, buildWalletAddress(userId, assetCode), nextBalance, nextUsd]
    );
  }
}

async function applyStrategyAllocations(client, userId, strategyLane) {
  var strategyConfig = getStrategyConfig(strategyLane);
  var allocationEntries;

  if (!strategyConfig) {
    return;
  }

  allocationEntries = Object.entries(strategyConfig.allocations);

  for (var allocationEntry of allocationEntries) {
    await client.query(
      'UPDATE public.ivory_portfolio_allocations SET allocation_pct = $3, description = $4 WHERE user_id = $1 AND asset_group = $2',
      [userId, allocationEntry[0], allocationEntry[1], allocationEntry[0] === 'Stable Reserves'
        ? 'Protected capital aligned to the ' + strategyLane + ' lane.'
        : allocationEntry[0] + ' allocation aligned to the ' + strategyLane + ' lane.']
    );
  }
}

function buildSeedBundle(userId) {
  return {
    profile: {
      totalBalance: 0,
      availableCash: 0,
      activeInvestments: 0,
      protectedReserves: 0,
      riskProfile: 'Balanced',
      withdrawalLimit: 2500,
      miningProjection: 0,
      strategyLane: 'Core Growth'
    },
    wallets: [
      {
        assetCode: 'BTC',
        assetName: 'Bitcoin',
        network: 'Bitcoin',
        walletAddress: 'IC-BTC-' + String(userId).padStart(4, '0') + '-PRIMARY',
        balance: 0,
        usdValue: 0
      },
      {
        assetCode: 'ETH',
        assetName: 'Ethereum',
        network: 'Ethereum',
        walletAddress: 'IC-ETH-' + String(userId).padStart(4, '0') + '-FLOW',
        balance: 0,
        usdValue: 0
      },
      {
        assetCode: 'USDT',
        assetName: 'Tether',
        network: 'TRC20',
        walletAddress: 'IC-USDT-' + String(userId).padStart(4, '0') + '-SAFE',
        balance: 0,
        usdValue: 0
      }
    ],
    transactions: [],
    notifications: [],
    allocations: [],
    kyc: {
      status: 'pending',
      submittedDocuments: 0,
      nextStep: 'Upload your identity and proof-of-address documents to complete verification.'
    }
  };
}

async function seedUserAccount(userRecord) {
  var client = await pool.connect();
  var seed = buildSeedBundle(Number(userRecord.id));

  try {
    await client.query('BEGIN');
    await client.query(
      'INSERT INTO public.ivory_account_profiles (user_id, total_balance, available_cash, active_investments, protected_reserves, risk_profile, withdrawal_limit, mining_projection, strategy_lane) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) ON CONFLICT (user_id) DO NOTHING',
      [
        userRecord.id,
        seed.profile.totalBalance,
        seed.profile.availableCash,
        seed.profile.activeInvestments,
        seed.profile.protectedReserves,
        seed.profile.riskProfile,
        seed.profile.withdrawalLimit,
        seed.profile.miningProjection,
        seed.profile.strategyLane
      ]
    );

    for (var wallet of seed.wallets) {
      await client.query(
        'INSERT INTO public.ivory_wallet_balances (user_id, asset_code, asset_name, network, wallet_address, balance, usd_value) VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (user_id, asset_code) DO NOTHING',
        [userRecord.id, wallet.assetCode, wallet.assetName, wallet.network, wallet.walletAddress, wallet.balance, wallet.usdValue]
      );
    }

    for (var allocation of seed.allocations) {
      await client.query(
        'INSERT INTO public.ivory_portfolio_allocations (user_id, asset_group, allocation_pct, description) VALUES ($1, $2, $3, $4) ON CONFLICT (user_id, asset_group) DO NOTHING',
        [userRecord.id, allocation.assetGroup, allocation.allocationPct, allocation.description]
      );
    }

    await client.query(
      'INSERT INTO public.ivory_kyc_records (user_id, status, submitted_documents, next_step, reviewed_at) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (user_id) DO NOTHING',
      [
        userRecord.id,
        seed.kyc.status,
        seed.kyc.submittedDocuments,
        seed.kyc.nextStep,
        seed.kyc.status === 'verified' ? new Date() : null
      ]
    );

    var transactionCount = await client.query('SELECT COUNT(*)::int AS count FROM public.ivory_transactions WHERE user_id = $1', [userRecord.id]);
    if (transactionCount.rows[0].count === 0) {
      for (var transaction of seed.transactions) {
        await createTransactionRecord(client, {
          userId: userRecord.id,
          assetCode: transaction.assetCode,
          entryType: transaction.entryType,
          status: transaction.status,
          amount: transaction.amount,
          createdAt: new Date(Date.now() - transaction.daysAgo * 24 * 60 * 60 * 1000),
          approvedAt: transaction.status === 'Approved' ? new Date(Date.now() - transaction.daysAgo * 24 * 60 * 60 * 1000) : null,
          notes: transaction.notes || null
        });
      }
    }

    var notificationCount = await client.query('SELECT COUNT(*)::int AS count FROM public.ivory_notifications WHERE user_id = $1', [userRecord.id]);
    if (notificationCount.rows[0].count === 0) {
      for (var notification of seed.notifications) {
        await createNotificationRecord(client, {
          userId: userRecord.id,
          category: notification.category,
          title: notification.title,
          body: notification.body,
          isUnread: notification.isUnread,
          createdAt: new Date(Date.now() - notification.daysAgo * 24 * 60 * 60 * 1000),
          readAt: notification.isUnread ? null : new Date(Date.now() - notification.daysAgo * 24 * 60 * 60 * 1000)
        });
      }
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function seedExistingUsers() {
  var users = await pool.query('SELECT id, first_name, last_name, email, country, created_at FROM public.ivory_users');
  for (var user of users.rows) {
    await seedUserAccount(user);
  }
}

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(function allowCors(req, res, next) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  next();
});

app.get('/api/health', async function health(req, res) {
  try {
    const result = await pool.query('SELECT NOW() AS now');
    res.json({ ok: true, database: result.rows[0].now, integrations: getNeonIntegrationConfig() });
  } catch (error) {
    res.status(500).json({ ok: false, message: 'Database connection failed.' });
  }
});

app.get('/api/auth/config', function authConfig(req, res) {
  res.json({ ok: true, integrations: getNeonIntegrationConfig() });
});

app.get('/api/dashboard/bootstrap', async function dashboardBootstrap(req, res) {
  var userId = Number(req.query.userId || 0);

  if (!Number.isInteger(userId) || userId < 1) {
    res.status(400).json({ ok: false, message: 'A valid userId is required.' });
    return;
  }

  try {
    var userResult = await pool.query('SELECT id, first_name, last_name, email, country, created_at FROM public.ivory_users WHERE id = $1', [userId]);
    if (userResult.rowCount === 0) {
      res.status(404).json({ ok: false, message: 'User account not found.' });
      return;
    }

    await seedUserAccount(userResult.rows[0]);

    var results = await Promise.all([
      pool.query('SELECT * FROM public.ivory_account_profiles WHERE user_id = $1', [userId]),
      pool.query('SELECT asset_code, asset_name, network, wallet_address, balance, usd_value FROM public.ivory_wallet_balances WHERE user_id = $1 ORDER BY asset_code', [userId]),
      pool.query('SELECT id, reference_code, asset_code, entry_type, status, amount, destination_reference, notes, approved_at, created_at FROM public.ivory_transactions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 20', [userId]),
      pool.query('SELECT id, reference_code, category, title, body, is_unread, read_at, related_transaction_id, created_at FROM public.ivory_notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 12', [userId]),
      pool.query('SELECT asset_group, allocation_pct, description FROM public.ivory_portfolio_allocations WHERE user_id = $1 ORDER BY allocation_pct DESC', [userId]),
      pool.query('SELECT status, submitted_documents, next_step, reviewed_at FROM public.ivory_kyc_records WHERE user_id = $1', [userId])
    ]);

    var profile = results[0].rows[0];
    var wallets = results[1].rows.map(function mapWallet(row) {
      return {
        assetCode: row.asset_code,
        assetName: row.asset_name,
        network: row.network,
        walletAddress: row.wallet_address,
        balance: toNumber(row.balance),
        usdValue: toNumber(row.usd_value)
      };
    });
    var transactions = results[2].rows.map(mapTransactionRow);
    var notifications = results[3].rows.map(mapNotificationRow);
    var allocations = results[4].rows.map(function mapAllocation(row) {
      return {
        assetGroup: row.asset_group,
        allocationPct: toNumber(row.allocation_pct),
        description: row.description
      };
    });
    var kyc = results[5].rows[0];

    res.json({
      ok: true,
      user: publicUser(userResult.rows[0]),
      profile: {
        totalBalance: toNumber(profile.total_balance),
        availableCash: toNumber(profile.available_cash),
        activeInvestments: toNumber(profile.active_investments),
        protectedReserves: toNumber(profile.protected_reserves),
        riskProfile: profile.risk_profile,
        withdrawalLimit: toNumber(profile.withdrawal_limit),
        miningProjection: toNumber(profile.mining_projection),
        strategyLane: profile.strategy_lane
      },
      wallets: wallets,
      transactions: transactions,
      notifications: notifications,
      operations: summarizeOperations(transactions, notifications),
      integrations: getNeonIntegrationConfig(),
      allocations: allocations,
      kyc: {
        status: kyc.status,
        submittedDocuments: Number(kyc.submitted_documents || 0),
        nextStep: kyc.next_step,
        reviewedAt: kyc.reviewed_at
      }
    });
  } catch (error) {
    console.error('Dashboard bootstrap error:', error);
    res.status(500).json({ ok: false, message: 'Unable to load dashboard data right now.' });
  }
});

app.post('/api/dashboard/topup', async function dashboardTopUp(req, res) {
  var userId = Number(req.body.userId || 0);
  var assetCode = normalizeAssetCode(req.body.assetCode);
  var amount = toCurrencyAmount(req.body.amount);
  var userRecord;
  var client;
  var createdTransaction;
  var createdNotification;

  if (!Number.isInteger(userId) || userId < 1) {
    res.status(400).json({ ok: false, message: 'A valid userId is required.' });
    return;
  }

  if (!getSupportedAsset(assetCode)) {
    res.status(400).json({ ok: false, message: 'Choose a supported funding asset.' });
    return;
  }

  if (!Number.isFinite(amount) || amount <= 0) {
    res.status(400).json({ ok: false, message: 'Enter a valid funding amount.' });
    return;
  }

  try {
    userRecord = await getUserRecordById(userId);
    if (!userRecord) {
      res.status(404).json({ ok: false, message: 'User account not found.' });
      return;
    }

    await seedUserAccount(userRecord);
    client = await pool.connect();

    try {
      await client.query('BEGIN');
      await client.query('SELECT user_id FROM public.ivory_account_profiles WHERE user_id = $1 FOR UPDATE', [userId]);
      await applyWalletUsdDelta(client, userId, assetCode, amount);
      await client.query(
        'UPDATE public.ivory_account_profiles SET total_balance = total_balance + $2, available_cash = available_cash + $2, updated_at = NOW() WHERE user_id = $1',
        [userId, amount]
      );
      createdTransaction = await createTransactionRecord(client, {
        userId: userId,
        assetCode: assetCode,
        entryType: 'Deposit',
        status: 'Approved',
        amount: amount,
        notes: 'Funding recorded from the top-up desk.'
      });
      createdNotification = await createNotificationRecord(client, {
        userId: userId,
        category: 'Funding',
        title: assetCode + ' deposit recorded',
        body: 'A top-up of ' + amount.toFixed(2) + ' USD has been applied to your ' + assetCode + ' funding wallet.',
        relatedTransactionId: createdTransaction.id
      });
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

    res.json({
      ok: true,
      message: formatCurrencyMessage(amount) + ' has been added to your ' + assetCode + ' wallet.',
      activity: buildActivityPayload(createdTransaction, createdNotification)
    });
  } catch (error) {
    console.error('Dashboard top-up error:', error);
    res.status(500).json({ ok: false, message: error.message || 'Unable to record the top-up right now.' });
  }
});

app.post('/api/dashboard/invest', async function dashboardInvest(req, res) {
  var userId = Number(req.body.userId || 0);
  var assetCode = normalizeAssetCode(req.body.assetCode);
  var amount = toCurrencyAmount(req.body.amount);
  var strategyLane = normalizeStrategyLane(req.body.strategyLane);
  var strategyConfig = getStrategyConfig(strategyLane);
  var userRecord;
  var client;
  var createdTransaction;
  var createdNotification;

  if (!Number.isInteger(userId) || userId < 1) {
    res.status(400).json({ ok: false, message: 'A valid userId is required.' });
    return;
  }

  if (!getSupportedAsset(assetCode)) {
    res.status(400).json({ ok: false, message: 'Choose a supported funding asset.' });
    return;
  }

  if (!strategyConfig) {
    res.status(400).json({ ok: false, message: 'Choose a supported investment lane.' });
    return;
  }

  if (!Number.isFinite(amount) || amount <= 0) {
    res.status(400).json({ ok: false, message: 'Enter a valid investment amount.' });
    return;
  }

  try {
    userRecord = await getUserRecordById(userId);
    if (!userRecord) {
      res.status(404).json({ ok: false, message: 'User account not found.' });
      return;
    }

    await seedUserAccount(userRecord);
    client = await pool.connect();

    try {
      var profileResult;
      var profile;
      var nextMiningProjection;

      await client.query('BEGIN');
      profileResult = await client.query('SELECT available_cash, mining_projection FROM public.ivory_account_profiles WHERE user_id = $1 FOR UPDATE', [userId]);
      profile = profileResult.rows[0];

      if (!profile || toNumber(profile.available_cash) < amount) {
        throw new Error('Available cash is too low for that investment amount.');
      }

      await applyWalletUsdDelta(client, userId, assetCode, -amount);
      nextMiningProjection = Number((toNumber(profile.mining_projection) + strategyConfig.miningBoost + amount / 25000000).toFixed(6));
      await client.query(
        'UPDATE public.ivory_account_profiles SET available_cash = available_cash - $2, active_investments = active_investments + $2, strategy_lane = $3, risk_profile = $4, mining_projection = $5, updated_at = NOW() WHERE user_id = $1',
        [userId, amount, strategyLane, strategyConfig.riskProfile, nextMiningProjection]
      );
      await applyStrategyAllocations(client, userId, strategyLane);
      createdTransaction = await createTransactionRecord(client, {
        userId: userId,
        assetCode: assetCode,
        entryType: 'Investment',
        status: 'Open',
        amount: amount,
        notes: 'Strategy lane selected: ' + strategyLane + '.'
      });
      createdNotification = await createNotificationRecord(client, {
        userId: userId,
        category: 'Strategy',
        title: strategyLane + ' allocation deployed',
        body: 'An investment of ' + amount.toFixed(2) + ' USD has been deployed using your ' + assetCode + ' balance.',
        relatedTransactionId: createdTransaction.id
      });
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

    res.json({
      ok: true,
      message: formatCurrencyMessage(amount) + ' has been deployed to the ' + strategyLane + ' lane.',
      activity: buildActivityPayload(createdTransaction, createdNotification)
    });
  } catch (error) {
    console.error('Dashboard invest error:', error);
    res.status(500).json({ ok: false, message: error.message || 'Unable to record the investment right now.' });
  }
});

app.post('/api/dashboard/withdraw', async function dashboardWithdraw(req, res) {
  var userId = Number(req.body.userId || 0);
  var assetCode = normalizeAssetCode(req.body.assetCode);
  var amount = toCurrencyAmount(req.body.amount);
  var destination = String(req.body.destination || '').trim();
  var userRecord;
  var client;
  var createdTransaction;
  var createdNotification;

  if (!Number.isInteger(userId) || userId < 1) {
    res.status(400).json({ ok: false, message: 'A valid userId is required.' });
    return;
  }

  if (!getSupportedAsset(assetCode)) {
    res.status(400).json({ ok: false, message: 'Choose a supported payout asset.' });
    return;
  }

  if (!Number.isFinite(amount) || amount <= 0) {
    res.status(400).json({ ok: false, message: 'Enter a valid withdrawal amount.' });
    return;
  }

  if (!destination) {
    res.status(400).json({ ok: false, message: 'Enter a destination wallet or settlement reference.' });
    return;
  }

  try {
    userRecord = await getUserRecordById(userId);
    if (!userRecord) {
      res.status(404).json({ ok: false, message: 'User account not found.' });
      return;
    }

    await seedUserAccount(userRecord);
    client = await pool.connect();

    try {
      var profileResult;
      var kycResult;
      var profile;
      var kyc;
      var status;

      await client.query('BEGIN');
      profileResult = await client.query('SELECT available_cash, withdrawal_limit FROM public.ivory_account_profiles WHERE user_id = $1 FOR UPDATE', [userId]);
      kycResult = await client.query('SELECT status FROM public.ivory_kyc_records WHERE user_id = $1 FOR UPDATE', [userId]);
      profile = profileResult.rows[0];
      kyc = kycResult.rows[0] || { status: 'pending' };

      if (!profile || toNumber(profile.available_cash) < amount) {
        throw new Error('Available cash is too low for that withdrawal.');
      }

      if (toNumber(profile.withdrawal_limit) < amount) {
        throw new Error('That request exceeds the current withdrawal limit.');
      }

      await applyWalletUsdDelta(client, userId, assetCode, -amount);
      await client.query(
        'UPDATE public.ivory_account_profiles SET total_balance = total_balance - $2, available_cash = available_cash - $2, updated_at = NOW() WHERE user_id = $1',
        [userId, amount]
      );
      status = kyc.status === 'verified' ? 'Approved' : 'Review';
      createdTransaction = await createTransactionRecord(client, {
        userId: userId,
        assetCode: assetCode,
        entryType: 'Withdrawal',
        status: status,
        amount: amount,
        destinationReference: destination,
        notes: 'Withdrawal staged from the dashboard withdrawal desk.'
      });
      createdNotification = await createNotificationRecord(client, {
        userId: userId,
        category: 'Withdrawal',
        title: 'Withdrawal request submitted',
        body: 'A ' + status.toLowerCase() + ' withdrawal of ' + amount.toFixed(2) + ' USD has been staged to ' + destination + '.',
        relatedTransactionId: createdTransaction.id
      });
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

    res.json({
      ok: true,
      message: formatCurrencyMessage(amount) + ' has been submitted for ' + assetCode + ' withdrawal.',
      activity: buildActivityPayload(createdTransaction, createdNotification)
    });
  } catch (error) {
    console.error('Dashboard withdraw error:', error);
    res.status(500).json({ ok: false, message: error.message || 'Unable to record the withdrawal right now.' });
  }
});

app.post('/api/dashboard/withdrawals/approve', async function dashboardApproveWithdrawal(req, res) {
  var userId = Number(req.body.userId || 0);
  var transactionId = Number(req.body.transactionId || 0);
  var userRecord;
  var client;

  if (!Number.isInteger(userId) || userId < 1) {
    res.status(400).json({ ok: false, message: 'A valid userId is required.' });
    return;
  }

  if (!Number.isInteger(transactionId) || transactionId < 1) {
    res.status(400).json({ ok: false, message: 'Choose a valid withdrawal to approve.' });
    return;
  }

  try {
    var updatedTransaction;
    var createdNotification;
    var transactionResult;
    var transaction;

    userRecord = await getUserRecordById(userId);
    if (!userRecord) {
      res.status(404).json({ ok: false, message: 'User account not found.' });
      return;
    }

    await seedUserAccount(userRecord);
    client = await pool.connect();

    try {
      await client.query('BEGIN');
      transactionResult = await client.query(
        'SELECT id, reference_code, asset_code, entry_type, status, amount, destination_reference, notes, approved_at, created_at FROM public.ivory_transactions WHERE id = $1 AND user_id = $2 FOR UPDATE',
        [transactionId, userId]
      );
      transaction = transactionResult.rows[0];

      if (!transaction || transaction.entry_type !== 'Withdrawal') {
        throw new Error('Withdrawal request not found.');
      }

      if (transaction.status !== 'Review') {
        throw new Error('Only reviewed withdrawals can be approved.');
      }

      updatedTransaction = (await client.query(
        'UPDATE public.ivory_transactions SET status = $3, approved_at = NOW(), notes = $4 WHERE id = $1 AND user_id = $2 RETURNING id, reference_code, asset_code, entry_type, status, amount, destination_reference, notes, approved_at, created_at',
        [transactionId, userId, 'Approved', 'Withdrawal approved by the operations desk.']
      )).rows[0];
      createdNotification = await createNotificationRecord(client, {
        userId: userId,
        category: 'Operations',
        title: 'Withdrawal approved',
        body: 'Withdrawal ' + updatedTransaction.reference_code + ' has been approved for settlement.',
        relatedTransactionId: updatedTransaction.id
      });
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

    res.json({
      ok: true,
      message: 'Withdrawal ' + updatedTransaction.reference_code + ' has been approved.',
      activity: buildActivityPayload(updatedTransaction, createdNotification)
    });
  } catch (error) {
    console.error('Withdrawal approval error:', error);
    res.status(500).json({ ok: false, message: error.message || 'Unable to approve the withdrawal right now.' });
  }
});

app.post('/api/dashboard/notifications/read', async function dashboardMarkNotificationsRead(req, res) {
  var userId = Number(req.body.userId || 0);
  var notificationId = Number(req.body.notificationId || 0);
  var markAll = Boolean(req.body.markAll);
  var result;

  if (!Number.isInteger(userId) || userId < 1) {
    res.status(400).json({ ok: false, message: 'A valid userId is required.' });
    return;
  }

  if (!markAll && (!Number.isInteger(notificationId) || notificationId < 1)) {
    res.status(400).json({ ok: false, message: 'Choose a valid notification to mark as read.' });
    return;
  }

  try {
    if (markAll) {
      result = await pool.query(
        'UPDATE public.ivory_notifications SET is_unread = FALSE, read_at = COALESCE(read_at, NOW()) WHERE user_id = $1 AND is_unread = TRUE RETURNING id',
        [userId]
      );
    } else {
      result = await pool.query(
        'UPDATE public.ivory_notifications SET is_unread = FALSE, read_at = COALESCE(read_at, NOW()) WHERE id = $1 AND user_id = $2 RETURNING id',
        [notificationId, userId]
      );
    }

    res.json({
      ok: true,
      message: markAll
        ? result.rowCount + ' notifications marked as read.'
        : 'Notification marked as read.',
      updatedCount: result.rowCount
    });
  } catch (error) {
    console.error('Notification read error:', error);
    res.status(500).json({ ok: false, message: 'Unable to update notification state right now.' });
  }
});

app.post('/api/auth/register', async function register(req, res) {
  const firstName = String(req.body.firstName || '').trim();
  const lastName = String(req.body.lastName || '').trim();
  const email = normalizeEmail(req.body.email);
  const password = String(req.body.password || '');
  const country = String(req.body.country || '').trim();

  if (!firstName || !lastName || !email || !password) {
    res.status(400).json({ ok: false, message: 'First name, last name, email, and password are required.' });
    return;
  }

  if (password.length < 6) {
    res.status(400).json({ ok: false, message: 'Password must be at least 6 characters long.' });
    return;
  }

  try {
    const existing = await pool.query('SELECT id FROM public.ivory_users WHERE email = $1', [email]);
    if (existing.rowCount > 0) {
      res.status(409).json({ ok: false, message: 'An account with that email already exists.' });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const insert = await pool.query(
      'INSERT INTO public.ivory_users (first_name, last_name, email, country, password_hash) VALUES ($1, $2, $3, $4, $5) RETURNING id, first_name, last_name, email, country, created_at',
      [firstName, lastName, email, country || null, passwordHash]
    );

    await seedUserAccount(insert.rows[0]);

    res.status(201).json({
      ok: true,
      message: 'Account created successfully.',
      redirectTo: 'http://127.0.0.1:' + port + '/server/dashboard/',
      user: publicUser(insert.rows[0])
    });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ ok: false, message: 'Unable to create account right now.' });
  }
});

app.post('/api/auth/login', async function login(req, res) {
  const email = normalizeEmail(req.body.email);
  const password = String(req.body.password || '');

  if (!email || !password) {
    res.status(400).json({ ok: false, message: 'Email and password are required.' });
    return;
  }

  try {
    const result = await pool.query('SELECT * FROM public.ivory_users WHERE email = $1', [email]);
    if (result.rowCount === 0) {
      res.status(401).json({ ok: false, message: 'Invalid email or password.' });
      return;
    }

    const user = result.rows[0];
    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      res.status(401).json({ ok: false, message: 'Invalid email or password.' });
      return;
    }

    await seedUserAccount(user);

    res.json({
      ok: true,
      message: 'Login successful.',
      redirectTo: 'http://127.0.0.1:' + port + '/server/dashboard/',
      user: publicUser(user)
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ ok: false, message: 'Unable to login right now.' });
  }
});

app.use(express.static(rootDir, { extensions: ['html'] }));

app.get('*', function fallback(req, res) {
  const notFoundFile = path.join(rootDir, 'index.html');
  res.sendFile(notFoundFile);
});

ensureSchema()
  .then(seedExistingUsers)
  .then(function onReady() {
    app.listen(port, function onListen() {
      console.log('Ivory Capital server listening on http://127.0.0.1:' + port);
    });
  })
  .catch(function onError(error) {
    console.error('Server failed to start:', error);
    process.exit(1);
  });
