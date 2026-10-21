-- V2__Add_qr_tables.sql
-- QR code tables for delivery verification

-- Enable UUID extension (already exists from V1, but safe to include)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- QR tokens: one per delivery, revocable, time-limited
CREATE TABLE delivery_qr_tokens (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    delivery_id UUID NOT NULL REFERENCES deliveries(id) ON DELETE CASCADE,
    token_hash VARCHAR(64) NOT NULL UNIQUE,  -- SHA-256 hex
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ,
    created_by UUID NOT NULL  -- customer or dispatcher who generated it
);

CREATE INDEX idx_qr_tokens_delivery_id ON delivery_qr_tokens(delivery_id);
CREATE INDEX idx_qr_tokens_expires_at ON delivery_qr_tokens(expires_at) WHERE expires_at IS NOT NULL;
CREATE INDEX idx_qr_tokens_created_by ON delivery_qr_tokens(created_by);

-- Scan history: append-only, no status mutation
CREATE TABLE delivery_qr_scans (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    delivery_id UUID NOT NULL REFERENCES deliveries(id) ON DELETE CASCADE,
    token_id UUID NOT NULL REFERENCES delivery_qr_tokens(id),
    driver_id UUID,  -- nullable for unauthorized scans
    action VARCHAR(20) NOT NULL CHECK (action IN ('PICKUP', 'DROPOFF', 'VERIFY')),
    result VARCHAR(20) NOT NULL CHECK (result IN ('SUCCESS', 'INVALID_TOKEN', 'EXPIRED', 'REVOKED', 'UNAUTHORIZED', 'WRONG_DELIVERY')),
    scanned_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    metadata JSONB  -- GPS coords, device info, etc.
);

CREATE INDEX idx_qr_scans_delivery_id ON delivery_qr_scans(delivery_id);
CREATE INDEX idx_qr_scans_driver_id ON delivery_qr_scans(driver_id);
CREATE INDEX idx_qr_scans_scanned_at ON delivery_qr_scans(scanned_at DESC);
CREATE INDEX idx_qr_scans_token_id ON delivery_qr_scans(token_id);
CREATE INDEX idx_qr_scans_action ON delivery_qr_scans(action);
CREATE INDEX idx_qr_scans_result ON delivery_qr_scans(result);