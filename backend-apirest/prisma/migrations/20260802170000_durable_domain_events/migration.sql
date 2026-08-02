CREATE TABLE "domain_outbox_events" (
    "id" TEXT NOT NULL,
    "event_name" TEXT NOT NULL,
    "aggregate_id" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "published_at" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "next_attempt_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "locked_at" TIMESTAMP(3),
    "last_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "domain_outbox_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "processed_domain_events" (
    "id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "consumer" TEXT NOT NULL,
    "processed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "processed_domain_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "domain_outbox_events_published_at_next_attempt_at_created_at_idx"
ON "domain_outbox_events"("published_at", "next_attempt_at", "created_at");

CREATE INDEX "domain_outbox_events_locked_at_idx" ON "domain_outbox_events"("locked_at");
CREATE UNIQUE INDEX "processed_domain_events_event_id_consumer_key" ON "processed_domain_events"("event_id", "consumer");
CREATE INDEX "processed_domain_events_processed_at_idx" ON "processed_domain_events"("processed_at");
