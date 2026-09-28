DROP INDEX "Photo_userId_createdAt_idx";

ALTER TABLE "Photo" ADD COLUMN     "position" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX "Photo_userId_position_idx" ON "Photo"("userId", "position");

UPDATE "Photo" p SET position = ranked.position
FROM (SELECT id, row_number() OVER (PARTITION BY "userId" ORDER BY "createdAt", id) - 1 AS position FROM "Photo") ranked
WHERE ranked.id = p.id;
