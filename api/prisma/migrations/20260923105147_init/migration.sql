CREATE TYPE "Gender" AS ENUM ('WOMAN', 'MAN', 'NONBINARY');

CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "birthDate" DATE NOT NULL,
    "gender" "Gender" NOT NULL,
    "seeking" "Gender"[],
    "city" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Question" (
    "id" TEXT NOT NULL,
    "dimension" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "noise" DOUBLE PRECISION NOT NULL,
    "reverse" BOOLEAN NOT NULL,

    CONSTRAINT "Question_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Answer" (
    "userId" UUID NOT NULL,
    "questionId" TEXT NOT NULL,
    "self" SMALLINT NOT NULL,
    "partner" SMALLINT NOT NULL,
    "importance" SMALLINT NOT NULL,
    "answeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Answer_pkey" PRIMARY KEY ("userId","questionId")
);

CREATE TABLE "Belief" (
    "userId" UUID NOT NULL,
    "muSelf" DOUBLE PRECISION[],
    "varSelf" DOUBLE PRECISION[],
    "muPref" DOUBLE PRECISION[],
    "varPref" DOUBLE PRECISION[],
    "logWSum" DOUBLE PRECISION[],
    "logWCount" DOUBLE PRECISION[],
    "answerCount" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Belief_pkey" PRIMARY KEY ("userId")
);

CREATE TABLE "DailyQuestionSet" (
    "userId" UUID NOT NULL,
    "day" DATE NOT NULL,
    "questionIds" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DailyQuestionSet_pkey" PRIMARY KEY ("userId","day")
);

CREATE TABLE "Match" (
    "id" UUID NOT NULL,
    "day" DATE NOT NULL,
    "userAId" UUID NOT NULL,
    "userBId" UUID NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "aligned" TEXT[],
    "friction" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Match_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MatchDecision" (
    "matchId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "liked" BOOLEAN NOT NULL,
    "decidedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MatchDecision_pkey" PRIMARY KEY ("matchId","userId")
);

CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

CREATE INDEX "Match_day_userAId_idx" ON "Match"("day", "userAId");

CREATE INDEX "Match_day_userBId_idx" ON "Match"("day", "userBId");

CREATE UNIQUE INDEX "Match_userAId_userBId_key" ON "Match"("userAId", "userBId");

ALTER TABLE "Answer" ADD CONSTRAINT "Answer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Answer" ADD CONSTRAINT "Answer_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Belief" ADD CONSTRAINT "Belief_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DailyQuestionSet" ADD CONSTRAINT "DailyQuestionSet_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Match" ADD CONSTRAINT "Match_userAId_fkey" FOREIGN KEY ("userAId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Match" ADD CONSTRAINT "Match_userBId_fkey" FOREIGN KEY ("userBId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MatchDecision" ADD CONSTRAINT "MatchDecision_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MatchDecision" ADD CONSTRAINT "MatchDecision_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
