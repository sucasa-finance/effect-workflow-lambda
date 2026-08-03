CREATE TABLE IF NOT EXISTS effect_workflow_executions (
  execution_id   VARCHAR(255) PRIMARY KEY,
  workflow_name  VARCHAR(255) NOT NULL,
  payload        JSON         NOT NULL,
  result         JSON         DEFAULT NULL,
  interrupted    BOOLEAN      NOT NULL DEFAULT FALSE,
  created_at     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS effect_workflow_activities (
  activity_id    VARCHAR(512) PRIMARY KEY,
  exit_value     JSON         DEFAULT NULL,
  created_at     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS effect_workflow_deferreds (
  execution_id   VARCHAR(255) NOT NULL,
  deferred_name  VARCHAR(255) NOT NULL,
  exit_value     JSON         NOT NULL,
  created_at     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (execution_id, deferred_name)
);
