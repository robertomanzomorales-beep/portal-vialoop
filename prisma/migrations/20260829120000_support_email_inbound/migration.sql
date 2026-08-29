CREATE TYPE "SupportRequestSource" AS ENUM ('MANUAL', 'EMAIL');

CREATE TYPE "SupportEmailDirection" AS ENUM ('INBOUND', 'OUTBOUND');

ALTER TABLE "SupportRequest"
  ADD COLUMN "source" "SupportRequestSource" NOT NULL DEFAULT 'MANUAL',
  ADD COLUMN "requesterName" TEXT,
  ADD COLUMN "requesterEmail" TEXT;

ALTER TABLE "SupportRequest"
  ALTER COLUMN "clientId" DROP NOT NULL;

ALTER TABLE "SupportRequest"
  DROP CONSTRAINT IF EXISTS "SupportRequest_clientId_fkey";

ALTER TABLE "SupportRequest"
  ADD CONSTRAINT "SupportRequest_clientId_fkey"
  FOREIGN KEY ("clientId") REFERENCES "Client"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "SupportEmailMessage" (
  "id" TEXT NOT NULL,
  "supportRequestId" TEXT NOT NULL,
  "providerMessageId" TEXT NOT NULL,
  "internetMessageId" TEXT,
  "direction" "SupportEmailDirection" NOT NULL DEFAULT 'INBOUND',
  "fromEmail" TEXT NOT NULL,
  "toEmail" TEXT,
  "subject" TEXT NOT NULL,
  "automaticReplyRequired" BOOLEAN NOT NULL DEFAULT false,
  "automaticReplySentAt" TIMESTAMP(3),
  "automaticReplyError" TEXT,
  "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "SupportEmailMessage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SupportEmailMessage_providerMessageId_key"
  ON "SupportEmailMessage"("providerMessageId");

CREATE INDEX "SupportRequest_requesterEmail_idx"
  ON "SupportRequest"("requesterEmail");

CREATE INDEX "SupportEmailMessage_supportRequestId_idx"
  ON "SupportEmailMessage"("supportRequestId");

CREATE INDEX "SupportEmailMessage_internetMessageId_idx"
  ON "SupportEmailMessage"("internetMessageId");

CREATE INDEX "SupportEmailMessage_receivedAt_idx"
  ON "SupportEmailMessage"("receivedAt");

ALTER TABLE "SupportEmailMessage"
  ADD CONSTRAINT "SupportEmailMessage_supportRequestId_fkey"
  FOREIGN KEY ("supportRequestId") REFERENCES "SupportRequest"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
