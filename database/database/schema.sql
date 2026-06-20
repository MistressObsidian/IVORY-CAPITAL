CREATE TABLE IF NOT EXISTS public.ivory_users (
  id BIGSERIAL PRIMARY KEY,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  country TEXT,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.ivory_account_profiles (
  user_id BIGINT PRIMARY KEY REFERENCES public.ivory_users(id) ON DELETE CASCADE,
  total_balance NUMERIC(12,2) NOT NULL DEFAULT 0,
  available_cash NUMERIC(12,2) NOT NULL DEFAULT 0,
  active_investments NUMERIC(12,2) NOT NULL DEFAULT 0,
  protected_reserves NUMERIC(12,2) NOT NULL DEFAULT 0,
  risk_profile TEXT NOT NULL DEFAULT 'Balanced',
  withdrawal_limit NUMERIC(12,2) NOT NULL DEFAULT 0,
  mining_projection NUMERIC(12,6) NOT NULL DEFAULT 0,
  strategy_lane TEXT NOT NULL DEFAULT 'Core Growth',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.ivory_wallet_balances (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES public.ivory_users(id) ON DELETE CASCADE,
  asset_code TEXT NOT NULL,
  asset_name TEXT NOT NULL,
  network TEXT,
  wallet_address TEXT,
  balance NUMERIC(18,6) NOT NULL DEFAULT 0,
  usd_value NUMERIC(12,2) NOT NULL DEFAULT 0,
  UNIQUE (user_id, asset_code)
);

CREATE TABLE IF NOT EXISTS public.ivory_transactions (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES public.ivory_users(id) ON DELETE CASCADE,
  asset_code TEXT NOT NULL,
  entry_type TEXT NOT NULL,
  status TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.ivory_transactions
  ADD COLUMN IF NOT EXISTS reference_code TEXT,
  ADD COLUMN IF NOT EXISTS destination_reference TEXT,
  ADD COLUMN IF NOT EXISTS notes TEXT,
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;

UPDATE public.ivory_transactions
SET reference_code = 'LEG-TXN-' || LPAD(id::text, 6, '0')
WHERE reference_code IS NULL;

UPDATE public.ivory_transactions
SET approved_at = created_at
WHERE approved_at IS NULL
  AND status = 'Approved';

CREATE UNIQUE INDEX IF NOT EXISTS ivory_transactions_reference_code_idx
  ON public.ivory_transactions(reference_code);

CREATE TABLE IF NOT EXISTS public.ivory_notifications (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES public.ivory_users(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  is_unread BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.ivory_notifications
  ADD COLUMN IF NOT EXISTS reference_code TEXT,
  ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS related_transaction_id BIGINT REFERENCES public.ivory_transactions(id) ON DELETE SET NULL;

UPDATE public.ivory_notifications
SET reference_code = 'LEG-NTF-' || LPAD(id::text, 6, '0')
WHERE reference_code IS NULL;

UPDATE public.ivory_notifications
SET read_at = created_at
WHERE read_at IS NULL
  AND is_unread = FALSE;

CREATE UNIQUE INDEX IF NOT EXISTS ivory_notifications_reference_code_idx
  ON public.ivory_notifications(reference_code);

CREATE TABLE IF NOT EXISTS public.ivory_portfolio_allocations (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES public.ivory_users(id) ON DELETE CASCADE,
  asset_group TEXT NOT NULL,
  allocation_pct NUMERIC(5,2) NOT NULL,
  description TEXT NOT NULL,
  UNIQUE (user_id, asset_group)
);

CREATE TABLE IF NOT EXISTS public.ivory_kyc_records (
  user_id BIGINT PRIMARY KEY REFERENCES public.ivory_users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending',
  submitted_documents INTEGER NOT NULL DEFAULT 0,
  next_step TEXT NOT NULL DEFAULT 'Upload a government-issued ID and proof of address.',
  reviewed_at TIMESTAMPTZ
);
