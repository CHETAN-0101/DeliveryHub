-- Notification Service Database Schema
-- This migration creates the core tables for notifications and templates

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create notifications table
CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    delivery_id UUID NOT NULL,
    recipient_type VARCHAR(20) NOT NULL, -- CUSTOMER, DRIVER, DISPATCHER
    recipient_id UUID NOT NULL,
    channel VARCHAR(20) NOT NULL, -- EMAIL, SMS, PUSH
    subject VARCHAR(500),
    body TEXT NOT NULL,
    template_name VARCHAR(100),
    template_data JSONB,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING', -- PENDING, SENT, FAILED
    error_message TEXT,
    sent_at TIMESTAMP WITH TIME ZONE,
    retry_count INT DEFAULT 0,
    max_retries INT DEFAULT 3,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_notifications_delivery_id ON notifications(delivery_id);
CREATE INDEX IF NOT EXISTS idx_notifications_recipient ON notifications(recipient_type, recipient_id);
CREATE INDEX IF NOT EXISTS idx_notifications_status ON notifications(status);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at DESC);
-- Composite index for finding pending notifications ready for retry
CREATE INDEX IF NOT EXISTS idx_notifications_retry ON notifications(status, retry_count, max_retries) WHERE status = 'PENDING' AND retry_count < max_retries;

-- Create notification_templates table
CREATE TABLE IF NOT EXISTS notification_templates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL UNIQUE,
    channel VARCHAR(20) NOT NULL,
    subject_template VARCHAR(500),
    body_template TEXT NOT NULL,
    variables JSONB, -- JSON schema for required variables
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    -- Ensure unique template per name and channel combination
    CONSTRAINT uk_template_name_channel UNIQUE (name, channel)
);

-- Create index for template lookups
CREATE INDEX IF NOT EXISTS idx_templates_name_channel ON notification_templates(name, channel);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger to auto-update updated_at on notifications table
DROP TRIGGER IF EXISTS update_notifications_updated_at ON notifications;
CREATE TRIGGER update_notifications_updated_at
    BEFORE UPDATE ON notifications
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Trigger to auto-update updated_at on templates table
DROP TRIGGER IF EXISTS update_templates_updated_at ON notification_templates;
CREATE TRIGGER update_templates_updated_at
    BEFORE UPDATE ON notification_templates
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();