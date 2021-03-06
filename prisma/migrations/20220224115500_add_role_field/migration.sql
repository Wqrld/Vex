-- RedefineTables
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_User" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "password" TEXT NOT NULL,
    "salt" TEXT NOT NULL,
    "resetTokenExpiry" INTEGER,
    "resetToken" TEXT,
    "role" TEXT NOT NULL DEFAULT 'user'
);
INSERT INTO "new_User" ("email", "id", "name", "password", "resetToken", "resetTokenExpiry", "salt") SELECT "email", "id", "name", "password", "resetToken", "resetTokenExpiry", "salt" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
PRAGMA foreign_key_check;
PRAGMA foreign_keys=ON;
