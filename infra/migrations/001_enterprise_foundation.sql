CREATE TABLE IF NOT EXISTS atom_runs (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  project_id TEXT NOT NULL DEFAULT 'default',
  user_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  state TEXT NOT NULL,
  test_id TEXT,
  session_id TEXT NOT NULL,
  payload JSONB NOT NULL,
  result JSONB,
  cancel_requested BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  UNIQUE (tenant_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS atom_runs_tenant_created_idx ON atom_runs(tenant_id, created_at DESC);

CREATE TABLE IF NOT EXISTS atom_run_events (
  run_id TEXT NOT NULL REFERENCES atom_runs(id) ON DELETE CASCADE,
  sequence BIGINT NOT NULL,
  tenant_id TEXT NOT NULL,
  type TEXT NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (run_id, sequence)
);

CREATE TABLE IF NOT EXISTS atom_audit_events (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS atom_audit_tenant_created_idx ON atom_audit_events(tenant_id, created_at DESC);

CREATE TABLE IF NOT EXISTS atom_artifacts (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  object_key TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size_bytes BIGINT NOT NULL DEFAULT 0,
  retention_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS atom_quota_usage (
  tenant_id TEXT NOT NULL,
  quota_date DATE NOT NULL,
  runs INTEGER NOT NULL DEFAULT 0,
  execution_seconds INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (tenant_id, quota_date)
);
