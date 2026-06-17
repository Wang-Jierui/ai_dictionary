CREATE TABLE "ReviewPlan" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "isDefault" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ReviewPlan_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ReviewPlanWord" (
  "reviewPlanId" TEXT NOT NULL,
  "vocabularyId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ReviewPlanWord_pkey" PRIMARY KEY ("reviewPlanId", "vocabularyId")
);

CREATE INDEX "ReviewPlanWord_vocabularyId_idx" ON "ReviewPlanWord"("vocabularyId");
CREATE INDEX "ReviewPlanWord_reviewPlanId_createdAt_idx" ON "ReviewPlanWord"("reviewPlanId", "createdAt");

ALTER TABLE "ReviewPlanWord" ADD CONSTRAINT "ReviewPlanWord_reviewPlanId_fkey" FOREIGN KEY ("reviewPlanId") REFERENCES "ReviewPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ReviewPlanWord" ADD CONSTRAINT "ReviewPlanWord_vocabularyId_fkey" FOREIGN KEY ("vocabularyId") REFERENCES "Vocabulary"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "ReviewPlan" ("id", "name", "isDefault", "updatedAt")
VALUES ('default', '默认复习计划', true, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "ReviewPlanWord" ("reviewPlanId", "vocabularyId")
SELECT 'default', "id" FROM "Vocabulary" WHERE "reviewEnabled" = true
ON CONFLICT DO NOTHING;
