-- CreateEnum
CREATE TYPE "RenewalReminderType" AS ENUM ('FIRST_NOTICE', 'SECOND_NOTICE', 'FINAL_NOTICE', 'OVERDUE_NOTICE', 'MANUAL');

-- CreateTable
CREATE TABLE "RenewalNotification" (
    "id" TEXT NOT NULL,
    "renewalId" TEXT NOT NULL,
    "type" "RenewalReminderType" NOT NULL,
    "recipient" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "sentOn" DATE NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RenewalNotification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RenewalNotification_renewalId_idx" ON "RenewalNotification"("renewalId");

-- CreateIndex
CREATE INDEX "RenewalNotification_type_idx" ON "RenewalNotification"("type");

-- CreateIndex
CREATE INDEX "RenewalNotification_sentAt_idx" ON "RenewalNotification"("sentAt");

-- CreateIndex
CREATE UNIQUE INDEX "RenewalNotification_renewalId_type_sentOn_key" ON "RenewalNotification"("renewalId", "type", "sentOn");

-- AddForeignKey
ALTER TABLE "RenewalNotification" ADD CONSTRAINT "RenewalNotification_renewalId_fkey" FOREIGN KEY ("renewalId") REFERENCES "Renewal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
