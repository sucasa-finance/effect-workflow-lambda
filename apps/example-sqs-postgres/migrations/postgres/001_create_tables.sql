CREATE TABLE IF NOT EXISTS effect_workflow_executions (
  execution_id   TEXT    PRIMARY KEY,
  workflow_name  TEXT    NOT NULL,
  payload        JSONB   NOT NULL,
  result         JSONB   DEFAULT NULL,
  interrupted    BOOLEAN NOT NULL DEFAULT FALSE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS effect_workflow_activities (
  activity_id    TEXT    PRIMARY KEY,
  exit_value     JSONB   DEFAULT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS effect_workflow_deferreds (
  execution_id   TEXT    NOT NULL,
  deferred_name  TEXT    NOT NULL,
  exit_value     JSONB   NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (execution_id, deferred_name)
);

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_executions_updated_at
  BEFORE UPDATE ON effect_workflow_executions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_activities_updated_at
  BEFORE UPDATE ON effect_workflow_activities
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
