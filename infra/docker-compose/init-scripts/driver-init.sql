-- Driver Service Database Initialization

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create drivers table
CREATE TABLE IF NOT EXISTS drivers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(200) NOT NULL,
    phone VARCHAR(50) NOT NULL UNIQUE,
    email VARCHAR(200),
    vehicle_type VARCHAR(30) NOT NULL,
    license_plate VARCHAR(20),
    status VARCHAR(20) NOT NULL DEFAULT 'OFFLINE',
    current_latitude DOUBLE PRECISION,
    current_longitude DOUBLE PRECISION,
    last_location_update TIMESTAMP WITH TIME ZONE,
    rating DOUBLE PRECISION DEFAULT 5.0,
    total_deliveries INT DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_drivers_status ON drivers(status);
CREATE INDEX IF NOT EXISTS idx_drivers_phone ON drivers(phone);
CREATE INDEX IF NOT EXISTS idx_drivers_location ON drivers(current_latitude, current_longitude);

-- Create driver_locations table for historical tracking
CREATE TABLE IF NOT EXISTS driver_locations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    driver_id UUID NOT NULL REFERENCES drivers(id),
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    accuracy DOUBLE PRECISION,
    heading DOUBLE PRECISION,
    speed DOUBLE PRECISION,
    recorded_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_driver_locations_driver_id ON driver_locations(driver_id);
CREATE INDEX IF NOT EXISTS idx_driver_locations_recorded_at ON driver_locations(recorded_at DESC);

-- Create driver_status_history table for audit
CREATE TABLE IF NOT EXISTS driver_status_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    driver_id UUID NOT NULL REFERENCES drivers(id),
    old_status VARCHAR(20),
    new_status VARCHAR(20) NOT NULL,
    changed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_driver_status_history_driver_id ON driver_status_history(driver_id);

-- Function to update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_drivers_updated_at ON drivers;
CREATE TRIGGER update_drivers_updated_at
    BEFORE UPDATE ON drivers
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Seed data for development
INSERT INTO drivers (id, name, phone, email, vehicle_type, license_plate, status, current_latitude, current_longitude, last_location_update, rating, total_deliveries)
VALUES
    (uuid_generate_v4(), 'John Driver', '+1234567890', 'john@driver.com', 'MOTORCYCLE', 'ABC-1234', 'AVAILABLE', 40.7128, -74.0060, CURRENT_TIMESTAMP, 4.8, 150),
    (uuid_generate_v4(), 'Jane Smith', '+1234567891', 'jane@driver.com', 'CAR', 'XYZ-5678', 'AVAILABLE', 40.7589, -73.9851, CURRENT_TIMESTAMP, 4.9, 200),
    (uuid_generate_v4(), 'Bob Wilson', '+1234567892', 'bob@driver.com', 'BICYCLE', 'DEF-9012', 'OFFLINE', 40.7614, -73.9776, CURRENT_TIMESTAMP - INTERVAL '1 hour', 4.7, 80),
    (uuid_generate_v4(), 'Alice Brown', '+1234567893', 'alice@driver.com', 'MOTORCYCLE', 'GHI-3456', 'BUSY', 40.7484, -73.9857, CURRENT_TIMESTAMP, 4.6, 120),
    (uuid_generate_v4(), 'Charlie Davis', '+1234567894', 'charlie@driver.com', 'CAR', 'JKL-7890', 'AVAILABLE', 40.7128, -74.0060, CURRENT_TIMESTAMP, 4.5, 90)
ON CONFLICT (phone) DO NOTHING;