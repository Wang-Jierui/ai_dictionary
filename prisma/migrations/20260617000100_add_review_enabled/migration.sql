-- Existing vocabulary rows keep their current implicit review enrollment.
ALTER TABLE "Vocabulary" ADD COLUMN "reviewEnabled" BOOLEAN NOT NULL DEFAULT true;

-- New rows are library-only until the user explicitly adds them to review.
ALTER TABLE "Vocabulary" ALTER COLUMN "reviewEnabled" SET DEFAULT false;
