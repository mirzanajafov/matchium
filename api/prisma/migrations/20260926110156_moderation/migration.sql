CREATE TYPE "Role" AS ENUM ('USER', 'ADMIN');

CREATE TYPE "ReportOutcome" AS ENUM ('DISMISSED', 'BANNED');

ALTER TABLE "Report" ADD COLUMN     "outcome" "ReportOutcome",
ADD COLUMN     "reviewedBy" UUID;

ALTER TABLE "User" ADD COLUMN     "bannedAt" TIMESTAMP(3),
ADD COLUMN     "role" "Role" NOT NULL DEFAULT 'USER';
