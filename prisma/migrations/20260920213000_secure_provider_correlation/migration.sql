ALTER TABLE "conversation_mapping"
  ADD COLUMN "internal_conversation_id" TEXT,
  ADD COLUMN "provider" TEXT NOT NULL DEFAULT 'LEGACY';

ALTER TABLE "support_message"
  ADD COLUMN "provider" TEXT,
  ADD COLUMN "email_message_id" TEXT,
  ADD COLUMN "email_in_reply_to" TEXT,
  ADD COLUMN "email_references" TEXT;

ALTER TABLE "internal_conversation"
  ADD COLUMN "channel" "conversation_channel" NOT NULL DEFAULT 'WEBCHAT';

ALTER TABLE "internal_message"
  ADD COLUMN "direction" "MessageDirection" NOT NULL DEFAULT 'OUTBOUND',
  ADD COLUMN "channel" "conversation_channel" NOT NULL DEFAULT 'WEBCHAT',
  ADD COLUMN "provider" TEXT,
  ADD COLUMN "external_id" TEXT,
  ADD COLUMN "email_message_id" TEXT,
  ADD COLUMN "email_in_reply_to" TEXT,
  ADD COLUMN "email_references" TEXT;

CREATE TABLE "user_contact_projection" (
  "user_id" UUID NOT NULL,
  "email" TEXT,
  "primary_phone" TEXT,
  "display_name" TEXT,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "user_contact_projection_pkey" PRIMARY KEY ("user_id")
);

ALTER TABLE "conversation_mapping"
  ADD CONSTRAINT "conversation_mapping_internal_conversation_id_fkey"
  FOREIGN KEY ("internal_conversation_id") REFERENCES "internal_conversation"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "conversation_mapping"
  ADD CONSTRAINT "conversation_mapping_single_target_check"
  CHECK (num_nonnulls("conversation_id", "internal_conversation_id") = 1);

DROP INDEX IF EXISTS "uq_internal_conversation";
CREATE UNIQUE INDEX "uq_internal_conversation"
  ON "internal_conversation"("tenant_id", "event_id", "channel", "type", "participant_hash");

CREATE UNIQUE INDEX "uq_support_message_provider_external"
  ON "support_message"("provider", "external_id");
CREATE UNIQUE INDEX "uq_internal_message_provider_external"
  ON "internal_message"("provider", "external_id");
CREATE INDEX "conversation_mapping_internal_conversation_id_idx"
  ON "conversation_mapping"("internal_conversation_id");
CREATE INDEX "user_contact_projection_email_idx"
  ON "user_contact_projection"("email");
CREATE INDEX "user_contact_projection_primary_phone_idx"
  ON "user_contact_projection"("primary_phone");
