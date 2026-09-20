-- Tenant scope is initially nullable so historic rows can be backfilled from
-- the trusted EVENT_TENANT_MAP during service bootstrap. Rows without a route
-- deliberately remain unavailable to tenant-scoped inbound processing.
ALTER TABLE "conversation_mapping" ADD COLUMN "tenant_id" UUID;
ALTER TABLE "support_conversation" ADD COLUMN "tenant_id" UUID;
ALTER TABLE "internal_conversation" ADD COLUMN "tenant_id" UUID;

ALTER TABLE "conversation_mapping" DROP CONSTRAINT "uq_conversation_mapping";
ALTER TABLE "conversation_mapping"
  ADD CONSTRAINT "uq_conversation_mapping" UNIQUE ("tenant_id", "channel", "external_id", "event_id");

CREATE INDEX "conversation_mapping_tenant_id_event_id_idx"
  ON "conversation_mapping"("tenant_id", "event_id");
CREATE INDEX "support_conversation_tenant_id_event_id_status_idx"
  ON "support_conversation"("tenant_id", "event_id", "status");
CREATE INDEX "internal_conversation_tenant_id_event_id_type_idx"
  ON "internal_conversation"("tenant_id", "event_id", "type");
