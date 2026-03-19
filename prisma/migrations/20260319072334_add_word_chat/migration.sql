-- CreateTable
CREATE TABLE "WordChat" (
    "id" TEXT NOT NULL,
    "word" TEXT NOT NULL,
    "messages" JSONB NOT NULL DEFAULT '[]',
    "activeLeafId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WordChat_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WordChat_word_key" ON "WordChat"("word");

-- CreateIndex
CREATE INDEX "WordChat_word_idx" ON "WordChat"("word");
