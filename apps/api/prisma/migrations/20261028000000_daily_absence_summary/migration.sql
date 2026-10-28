CREATE TABLE "DailyAbsenceSummary" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "unexcusedHours" INTEGER NOT NULL,
    "excusedHours" INTEGER NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'paper',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "DailyAbsenceSummary_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "DailyAbsenceSummary_nonnegative_hours" CHECK ("unexcusedHours" >= 0 AND "excusedHours" >= 0)
);

CREATE UNIQUE INDEX "DailyAbsenceSummary_groupId_studentId_date_key"
  ON "DailyAbsenceSummary"("groupId", "studentId", "date");
CREATE INDEX "DailyAbsenceSummary_groupId_date_idx"
  ON "DailyAbsenceSummary"("groupId", "date");

ALTER TABLE "DailyAbsenceSummary" ADD CONSTRAINT "DailyAbsenceSummary_groupId_fkey"
  FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DailyAbsenceSummary" ADD CONSTRAINT "DailyAbsenceSummary_studentId_fkey"
  FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
