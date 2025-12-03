-- Enable foreign key support in SQLite.
PRAGMA foreign_keys = ON;

-- High-level event containers.
CREATE TABLE IF NOT EXISTS events (
    event_id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    date_start TEXT NOT NULL,
    date_end TEXT NOT NULL
);

-- Locations or roles within an event.
CREATE TABLE IF NOT EXISTS stations (
    station_id INTEGER PRIMARY KEY,
    event_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    FOREIGN KEY (event_id) REFERENCES events(event_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_stations_event_id ON stations(event_id);

-- Defined shifts/slots, representing the demand for volunteers.
CREATE TABLE IF NOT EXISTS time_blocks (
    block_id INTEGER PRIMARY KEY,
    station_id INTEGER NOT NULL,
    start_time TEXT NOT NULL,
    end_time TEXT NOT NULL,
    capacity_needed INTEGER NOT NULL DEFAULT 1,
    FOREIGN KEY (station_id) REFERENCES stations(station_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_time_blocks_scheduling ON time_blocks(station_id, start_time, end_time);

-- Personally Identifiable Information (PII) for volunteers.
CREATE TABLE IF NOT EXISTS volunteers (
    volunteer_id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    phone_number TEXT,
    email_opt_in INTEGER NOT NULL DEFAULT 1,
    email_opted_out_at TEXT,
    email_opt_out_reason TEXT
);
CREATE INDEX IF NOT EXISTS idx_volunteers_email ON volunteers(email);

-- Links a volunteer to a specific time block, representing a commitment.
CREATE TABLE IF NOT EXISTS reservations (
    reservation_id INTEGER PRIMARY KEY,
    volunteer_id INTEGER NOT NULL,
    block_id INTEGER NOT NULL,
    reservation_date TEXT NOT NULL,
    FOREIGN KEY (volunteer_id) REFERENCES volunteers(volunteer_id) ON DELETE CASCADE,
    FOREIGN KEY (block_id) REFERENCES time_blocks(block_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_reservations_volunteer_id ON reservations(volunteer_id);
CREATE INDEX IF NOT EXISTS idx_reservations_block_id ON reservations(block_id);
