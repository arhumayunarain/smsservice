-- CreateEnum
CREATE TYPE "SendVia" AS ENUM ('DEVICE', 'API');

-- AlterTable: Make deviceId optional on Message
ALTER TABLE "Message" ALTER COLUMN "deviceId" DROP NOT NULL;

-- AlterTable: Add outreachTransactionId to Message
ALTER TABLE "Message" ADD COLUMN "outreachTransactionId" TEXT;

-- AlterTable: Make deviceId optional on Campaign, add sendVia
ALTER TABLE "Campaign" ALTER COLUMN "deviceId" DROP NOT NULL;
ALTER TABLE "Campaign" ADD COLUMN "sendVia" "SendVia" NOT NULL DEFAULT 'DEVICE';
