-- CreateEnum
CREATE TYPE "FlowOrderStatus" AS ENUM ('PENDING', 'PAID', 'REJECTED', 'CANCELLED', 'ERROR');

-- CreateTable
CREATE TABLE "FlowOrder" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "commerceOrder" TEXT NOT NULL,
    "flowOrder" INTEGER,
    "token" TEXT,
    "paymentUrl" TEXT,
    "status" "FlowOrderStatus" NOT NULL DEFAULT 'PENDING',
    "amount" DECIMAL(12,2) NOT NULL,
    "payerEmail" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "rawResponse" JSONB,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FlowOrder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FlowOrder_commerceOrder_key" ON "FlowOrder"("commerceOrder");

-- CreateIndex
CREATE UNIQUE INDEX "FlowOrder_flowOrder_key" ON "FlowOrder"("flowOrder");

-- CreateIndex
CREATE UNIQUE INDEX "FlowOrder_token_key" ON "FlowOrder"("token");

-- CreateIndex
CREATE INDEX "FlowOrder_paymentId_idx" ON "FlowOrder"("paymentId");

-- CreateIndex
CREATE INDEX "FlowOrder_status_idx" ON "FlowOrder"("status");

-- CreateIndex
CREATE INDEX "FlowOrder_createdAt_idx" ON "FlowOrder"("createdAt");

-- AddForeignKey
ALTER TABLE "FlowOrder" ADD CONSTRAINT "FlowOrder_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
