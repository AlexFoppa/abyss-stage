PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS "user" (
  id INTEGER NOT NULL PRIMARY KEY,
  name VARCHAR NOT NULL,
  email VARCHAR NOT NULL,
  password_hash VARCHAR NOT NULL,
  role VARCHAR(6) NOT NULL,
  must_reset_password BOOLEAN NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS ix_user_email ON "user" (email);
CREATE INDEX IF NOT EXISTS ix_user_role ON "user" (role);
