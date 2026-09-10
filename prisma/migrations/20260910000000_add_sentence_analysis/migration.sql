CREATE TABLE "SentenceAnalysis" (
    "id" TEXT NOT NULL,
    "sentence" TEXT NOT NULL,
    "context" TEXT NOT NULL DEFAULT '',
    "source" TEXT NOT NULL DEFAULT '',
    "analysis" JSONB NOT NULL,
    "messages" JSONB NOT NULL DEFAULT '[]',
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SentenceAnalysis_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SentenceAnalysis_createdAt_idx" ON "SentenceAnalysis"("createdAt");
