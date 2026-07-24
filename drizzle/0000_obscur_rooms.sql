CREATE TABLE IF NOT EXISTS obscur_rooms (
  code TEXT PRIMARY KEY,
  state TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  expires_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS obscur_rooms_expires_at_idx
ON obscur_rooms (expires_at);
