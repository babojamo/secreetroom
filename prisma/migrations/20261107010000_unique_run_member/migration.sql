ALTER TABLE "Assignment" ADD COLUMN "runId" TEXT;
UPDATE "Assignment" SET "runId" = "Party"."runId" FROM "Party" WHERE "Party"."id" = "Assignment"."partyId";
ALTER TABLE "Assignment" ALTER COLUMN "runId" SET NOT NULL;
CREATE UNIQUE INDEX "Assignment_runId_memberId_key" ON "Assignment"("runId", "memberId");
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_runId_fkey" FOREIGN KEY ("runId") REFERENCES "Run"("id") ON DELETE CASCADE ON UPDATE CASCADE;
