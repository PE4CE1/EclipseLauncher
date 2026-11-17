CREATE TABLE IF NOT EXISTS shares (
 id TEXT PRIMARY KEY, token_hash TEXT NOT NULL UNIQUE, owner TEXT NOT NULL, title TEXT NOT NULL,
 bytes INTEGER NOT NULL CHECK(bytes>0), created INTEGER NOT NULL, expires INTEGER NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('reserved','uploading','ready'))
);
CREATE INDEX IF NOT EXISTS shares_owner_created ON shares(owner,created);
CREATE INDEX IF NOT EXISTS shares_expires ON shares(expires);
CREATE TABLE IF NOT EXISTS upload_reservations (id TEXT PRIMARY KEY, owner TEXT NOT NULL, created INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS upload_reservations_owner_created ON upload_reservations(owner,created);
