-- CreateEnum
CREATE TYPE "SaleStatus" AS ENUM ('ACTIVE', 'CANCELLED');

-- CreateTable
CREATE TABLE "Sale" (
    "id" TEXT NOT NULL,
    "number" SERIAL NOT NULL,
    "clientId" TEXT NOT NULL,
    "service" TEXT NOT NULL,
    "saleDate" DATE NOT NULL,
    "netAmount" DECIMAL(12,2) NOT NULL,
    "status" "SaleStatus" NOT NULL DEFAULT 'ACTIVE',
    "notes" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Sale_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Sale_number_key" ON "Sale"("number");

-- CreateIndex
CREATE INDEX "Sale_clientId_idx" ON "Sale"("clientId");

-- CreateIndex
CREATE INDEX "Sale_saleDate_idx" ON "Sale"("saleDate");

-- CreateIndex
CREATE INDEX "Sale_status_idx" ON "Sale"("status");

-- CreateIndex
CREATE INDEX "Sale_status_saleDate_idx" ON "Sale"("status", "saleDate");

-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
