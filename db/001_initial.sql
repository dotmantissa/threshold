CREATE TABLE IF NOT EXISTS threshold_users (
  privy_id text PRIMARY KEY, email text NOT NULL, wallet text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS threshold_users_wallet ON threshold_users (lower(wallet));
CREATE TABLE IF NOT EXISTS threshold_tenancies (
  id uuid PRIMARY KEY, label text NOT NULL,
  creator_id text NOT NULL REFERENCES threshold_users(privy_id),
  counterparty_id text NOT NULL REFERENCES threshold_users(privy_id),
  creator_wallet text NOT NULL, counterparty_wallet text NOT NULL,
  creator_role text NOT NULL CHECK (creator_role IN ('tenant','landlord')),
  chain_id text UNIQUE, draft jsonb NOT NULL, snapshot jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS threshold_tenancies_creator ON threshold_tenancies(creator_id);
CREATE INDEX IF NOT EXISTS threshold_tenancies_counterparty ON threshold_tenancies(counterparty_id);
CREATE TABLE IF NOT EXISTS threshold_operations (
  id uuid PRIMARY KEY, tenancy_id uuid NOT NULL REFERENCES threshold_tenancies(id),
  user_id text NOT NULL REFERENCES threshold_users(privy_id),
  action text NOT NULL, call jsonb NOT NULL, tx_hash text UNIQUE,
  status text NOT NULL CHECK (status IN ('PREPARED','SUBMITTED','CONFIRMED','FAILED')),
  error text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS threshold_operations_tenancy ON threshold_operations(tenancy_id, created_at DESC);
CREATE TABLE IF NOT EXISTS threshold_evidence (
  sha256 text PRIMARY KEY CHECK (sha256 ~ '^[a-f0-9]{64}$'),
  storage_key text NOT NULL, public_url text NOT NULL,
  byte_length integer NOT NULL CHECK(byte_length > 0 AND byte_length <= 8388608),
  mime_type text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS threshold_evidence_links (
  tenancy_id uuid NOT NULL REFERENCES threshold_tenancies(id),
  sha256 text NOT NULL REFERENCES threshold_evidence(sha256),
  owner_id text NOT NULL REFERENCES threshold_users(privy_id),
  PRIMARY KEY(tenancy_id, sha256, owner_id)
);
CREATE TABLE IF NOT EXISTS threshold_limits (
  subject text NOT NULL, bucket bigint NOT NULL, count integer NOT NULL DEFAULT 1,
  PRIMARY KEY(subject, bucket)
);

ALTER TABLE threshold_tenancies ADD COLUMN IF NOT EXISTS snapshot jsonb;

CREATE UNIQUE INDEX IF NOT EXISTS threshold_operations_one_active ON threshold_operations(tenancy_id) WHERE status IN ('PREPARED','SUBMITTED');
