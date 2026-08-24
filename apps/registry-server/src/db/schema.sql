PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS wallets (
  wallet_id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  suite_version TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('ACTIVE','REVOKED','SUSPENDED')),
  commitment_root TEXT NULL
);

CREATE TABLE IF NOT EXISTS wallet_keys (
  key_id TEXT PRIMARY KEY,
  wallet_id TEXT NOT NULL,
  key_type TEXT NOT NULL CHECK (key_type IN ('SIGNING','RECOVERY','DEVICE')),
  key_material TEXT NOT NULL CHECK (json_valid(key_material)),
  webauthn_credential_id TEXT NULL,
  created_at TEXT NOT NULL,
  revoked_at TEXT NULL,
  expires_at TEXT NOT NULL DEFAULT (datetime(datetime('now'), '+365 days')),
  FOREIGN KEY (wallet_id) REFERENCES wallets(wallet_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS issuer_keys (
  issuer_did TEXT NOT NULL,
  key_id TEXT NOT NULL,
  key_material TEXT NOT NULL CHECK (json_valid(key_material)),
  algorithm TEXT NOT NULL CHECK (algorithm IN ('ECDSA_P256_SHA256_1.0.0')),
  status TEXT NOT NULL CHECK (status IN ('ACTIVE','SUSPENDED','REVOKED')),
  created_at TEXT NOT NULL,
  revoked_at TEXT NULL,
  PRIMARY KEY (issuer_did, key_id)
);

CREATE TABLE IF NOT EXISTS issuer_audit_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  issuer_did TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('ISSUER_KEY_REGISTERED','ISSUER_KEYS_REVOKED')),
  metadata TEXT NOT NULL CHECK (json_valid(metadata)),
  timestamp TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS revocations (
  revocation_id TEXT PRIMARY KEY,
  target_type TEXT NOT NULL CHECK (target_type IN ('KEY','CREDENTIAL','WALLET')),
  target_id TEXT NOT NULL,
  reason_code TEXT NOT NULL,
  effective_at TEXT NOT NULL,
  signature TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS backups (
  backup_id TEXT PRIMARY KEY,
  wallet_id TEXT NOT NULL,
  ciphertext TEXT NOT NULL,
  algorithm TEXT NOT NULL CHECK (algorithm IN ('AES-256-GCM')),
  created_at TEXT NOT NULL,
  FOREIGN KEY (wallet_id) REFERENCES wallets(wallet_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS audit_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_type TEXT NOT NULL CHECK (event_type IN ('WALLET_REGISTERED','KEY_ADDED','KEY_REVOKED','CREDENTIAL_REVOKED','WALLET_REVOKED','STATUS_CHECK','BACKUP_STORED','LOGIN_SUCCESS','LOGIN_FAILED','LOGOUT','CONTACT_RECEIVED','CONTACT_VIEWED','CONTACT_STATUS','USER_REGISTERED','USER_LOGIN')),
  wallet_id TEXT NULL,
  metadata TEXT NOT NULL CHECK (json_valid(metadata)),
  timestamp TEXT NOT NULL,
  FOREIGN KEY (wallet_id) REFERENCES wallets(wallet_id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS admins (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS contact_messages (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  subject TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('NEW','READ','ARCHIVED')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  verified BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_wallets_status ON wallets(status);
CREATE INDEX IF NOT EXISTS idx_wallets_created_at ON wallets(created_at);
CREATE INDEX IF NOT EXISTS idx_wallet_keys_wallet_id ON wallet_keys(wallet_id);
CREATE INDEX IF NOT EXISTS idx_wallet_keys_created_at ON wallet_keys(created_at);
CREATE INDEX IF NOT EXISTS idx_wallet_keys_revoked_at ON wallet_keys(revoked_at);
CREATE INDEX IF NOT EXISTS idx_wallet_keys_expires_at ON wallet_keys(expires_at);
CREATE INDEX IF NOT EXISTS idx_issuer_keys_status ON issuer_keys(status);
CREATE INDEX IF NOT EXISTS idx_issuer_keys_created_at ON issuer_keys(created_at);
CREATE INDEX IF NOT EXISTS idx_issuer_audit_timestamp ON issuer_audit_events(timestamp);
CREATE INDEX IF NOT EXISTS idx_revocations_effective_at ON revocations(effective_at);
CREATE INDEX IF NOT EXISTS idx_revocations_target_id ON revocations(target_id);
CREATE INDEX IF NOT EXISTS idx_backups_wallet_id ON backups(wallet_id);
CREATE INDEX IF NOT EXISTS idx_backups_created_at ON backups(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_events_wallet_id ON audit_events(wallet_id);
CREATE INDEX IF NOT EXISTS idx_audit_events_timestamp ON audit_events(timestamp);
CREATE INDEX IF NOT EXISTS idx_contact_messages_status ON contact_messages(status);
CREATE INDEX IF NOT EXISTS idx_contact_messages_created_at ON contact_messages(created_at);
CREATE INDEX IF NOT EXISTS idx_sessions_email ON sessions(email);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);
