-- AlterEnum
ALTER TYPE "MessageStatus" ADD VALUE 'PENDING';

-- DropIndex
DROP INDEX "Campaign_deviceId_idx";

-- DropIndex
DROP INDEX "Campaign_templateId_idx";

-- DropIndex
DROP INDEX "CampaignRecipient_campaignId_idx";

-- AlterTable
ALTER TABLE "Device" ADD COLUMN     "rateLimitMax" INTEGER,
ADD COLUMN     "rateLimitUnit" TEXT,
ADD COLUMN     "simSlot" INTEGER;

-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "campaignId" TEXT,
ADD COLUMN     "queuedAt" TIMESTAMP(3);

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;
