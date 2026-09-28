ALTER TABLE "Report" DROP CONSTRAINT "Report_matchId_fkey";

ALTER TABLE "Report" DROP CONSTRAINT "Report_reportedId_fkey";

ALTER TABLE "Report" DROP CONSTRAINT "Report_reporterId_fkey";

ALTER TABLE "Report" ADD COLUMN     "evidence" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "reportedEmail" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "reportedName" TEXT NOT NULL DEFAULT '',
ALTER COLUMN "matchId" DROP NOT NULL,
ALTER COLUMN "reporterId" DROP NOT NULL,
ALTER COLUMN "reportedId" DROP NOT NULL;

CREATE INDEX "Report_reportedEmail_idx" ON "Report"("reportedEmail");

ALTER TABLE "Report" ADD CONSTRAINT "Report_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Report" ADD CONSTRAINT "Report_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Report" ADD CONSTRAINT "Report_reportedId_fkey" FOREIGN KEY ("reportedId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

UPDATE "Report" r SET "reportedName" = u."displayName", "reportedEmail" = u.email
FROM "User" u WHERE u.id = r."reportedId";

UPDATE "Report" r SET evidence = COALESCE((
  SELECT jsonb_agg(jsonb_build_object(
    'from', CASE WHEN m."senderId" = r."reportedId" THEN 'reported' ELSE 'reporter' END,
    'body', m.body,
    'sentAt', to_char(m."createdAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
  ) ORDER BY m."createdAt")
  FROM (SELECT * FROM "Message" WHERE "matchId" = r."matchId" ORDER BY "createdAt" DESC LIMIT 50) m
), '[]'::jsonb);
