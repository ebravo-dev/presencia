CREATE TYPE "LogLevel" AS ENUM ('DEBUG', 'INFO', 'WARN', 'ERROR', 'FATAL');
CREATE TYPE "LogApplication" AS ENUM ('STUDENT', 'PROFESSOR');
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE "app_log_events" (
    "id" UUID NOT NULL,
    "schema_version" INTEGER NOT NULL,
    "batch_id" UUID NOT NULL,
    "sequence" BIGINT NOT NULL,
    "level" "LogLevel" NOT NULL,
    "application" "LogApplication" NOT NULL,
    "event_name" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "installation_id" UUID NOT NULL,
    "app_session_id" UUID NOT NULL,
    "user_identifier" TEXT,
    "app_version" TEXT NOT NULL,
    "build_number" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "os_version" TEXT NOT NULL,
    "device_model" TEXT,
    "device_manufacturer" TEXT,
    "locale" TEXT,
    "timezone_offset" TEXT,
    "network_type" TEXT,
    "error_type" TEXT,
    "error_message" TEXT,
    "stack_trace" TEXT,
    "correlation_id" TEXT,
    "context" JSONB,
    "source_ip" TEXT,
    CONSTRAINT "app_log_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "app_log_events_received_at_idx" ON "app_log_events"("received_at" DESC);
CREATE INDEX "app_log_events_level_received_at_idx" ON "app_log_events"("level", "received_at" DESC);
CREATE INDEX "app_log_events_application_received_at_idx" ON "app_log_events"("application", "received_at" DESC);
CREATE INDEX "app_log_events_installation_id_received_at_idx" ON "app_log_events"("installation_id", "received_at" DESC);
CREATE INDEX "app_log_events_user_identifier_received_at_idx" ON "app_log_events"("user_identifier", "received_at" DESC);
CREATE INDEX "app_log_events_event_name_received_at_idx" ON "app_log_events"("event_name", "received_at" DESC);
CREATE INDEX "app_log_events_message_trgm_idx" ON "app_log_events" USING GIN ("message" gin_trgm_ops);
CREATE INDEX "app_log_events_event_name_trgm_idx" ON "app_log_events" USING GIN ("event_name" gin_trgm_ops);
CREATE INDEX "app_log_events_error_message_trgm_idx" ON "app_log_events" USING GIN ("error_message" gin_trgm_ops);
CREATE INDEX "app_log_events_user_identifier_trgm_idx" ON "app_log_events" USING GIN ("user_identifier" gin_trgm_ops);
CREATE INDEX "app_log_events_correlation_id_trgm_idx" ON "app_log_events" USING GIN ("correlation_id" gin_trgm_ops);

-- Defense in depth: the runtime database role can append and read logs, but a
-- bug or generic cleanup command cannot mutate evidence already accepted.
CREATE FUNCTION reject_app_log_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'app_log_events is append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER app_log_events_append_only
BEFORE UPDATE OR DELETE ON "app_log_events"
FOR EACH ROW EXECUTE FUNCTION reject_app_log_mutation();

CREATE TRIGGER app_log_events_reject_truncate
BEFORE TRUNCATE ON "app_log_events"
FOR EACH STATEMENT EXECUTE FUNCTION reject_app_log_mutation();
