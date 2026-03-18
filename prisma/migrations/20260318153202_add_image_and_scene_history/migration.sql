-- AlterTable
ALTER TABLE "Vocabulary" ADD COLUMN     "imageData" TEXT,
ADD COLUMN     "imageMode" TEXT;

-- CreateTable
CREATE TABLE "SceneHistory" (
    "id" TEXT NOT NULL,
    "scene" TEXT NOT NULL,
    "expressions" JSONB NOT NULL,
    "dialogue" TEXT NOT NULL,
    "culturalNotes" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SceneHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SceneHistory_createdAt_idx" ON "SceneHistory"("createdAt");
