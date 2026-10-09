CREATE TABLE "GradePdfImport" (
    "id" TEXT NOT NULL,
    "checksum" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "academicYearStart" INTEGER NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GradePdfImport_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GradeEntry" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "columnIndex" INTEGER NOT NULL,
    "value" TEXT NOT NULL,
    "importId" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "GradeEntry_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GradePdfImport_checksum_key" ON "GradePdfImport"("checksum");
CREATE UNIQUE INDEX "GradeEntry_studentId_subject_date_columnIndex_key" ON "GradeEntry"("studentId", "subject", "date", "columnIndex");
CREATE INDEX "GradeEntry_studentId_subject_idx" ON "GradeEntry"("studentId", "subject");

ALTER TABLE "GradeEntry" ADD CONSTRAINT "GradeEntry_studentId_fkey"
  FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GradeEntry" ADD CONSTRAINT "GradeEntry_importId_fkey"
  FOREIGN KEY ("importId") REFERENCES "GradePdfImport"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
