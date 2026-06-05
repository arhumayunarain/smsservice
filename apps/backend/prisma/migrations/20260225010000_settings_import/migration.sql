-- CreateEnum
CREATE TYPE "ImportSource" AS ENUM ('CSV', 'XLSX', 'SHEETS', 'POSTEX');

-- CreateEnum
CREATE TYPE "ImportJobStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateTable: Setting
CREATE TABLE "Setting" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Setting_pkey" PRIMARY KEY ("key")
);

-- CreateTable: ImportJob
CREATE TABLE "ImportJob" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT,
    "source" "ImportSource" NOT NULL,
    "status" "ImportJobStatus" NOT NULL DEFAULT 'PENDING',
    "fileName" TEXT,
    "rowCount" INTEGER,
    "errorCount" INTEGER,
    "error" TEXT,
    "metadata" JSONB,
    "parsedData" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ImportJob_pkey" PRIMARY KEY ("id")
);
