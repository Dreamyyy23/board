export const obscurRoomsSchema = `
  CREATE TABLE IF NOT EXISTS obscur_rooms (
    code TEXT PRIMARY KEY,
    state TEXT NOT NULL,
    version INTEGER NOT NULL DEFAULT 1,
    expires_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )
`;
