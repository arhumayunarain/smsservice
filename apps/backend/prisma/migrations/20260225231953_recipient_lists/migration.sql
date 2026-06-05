-- AlterEnum
ALTER TYPE "ImportSource" ADD VALUE 'MANUAL';

-- AlterTable
ALTER TABLE "Campaign" ADD COLUMN     "recipientListId" TEXT;

-- CreateTable
CREATE TABLE "RecipientList" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "source" "ImportSource" NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecipientList_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecipientListEntry" (
    "id" TEXT NOT NULL,
    "listId" TEXT NOT NULL,
    "phoneNumber" TEXT NOT NULL,
    "variables" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecipientListEntry_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_recipientListId_fkey" FOREIGN KEY ("recipientListId") REFERENCES "RecipientList"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecipientListEntry" ADD CONSTRAINT "RecipientListEntry_listId_fkey" FOREIGN KEY ("listId") REFERENCES "RecipientList"("id") ON DELETE CASCADE ON UPDATE CASCADE;
