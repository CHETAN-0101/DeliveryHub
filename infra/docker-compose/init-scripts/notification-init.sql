-- Notification Service Database Initialization

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

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_notifications_delivery_id ON notifications(delivery_id);
CREATE INDEX IF NOT EXISTS idx_notifications_recipient ON notifications(recipient_type, recipient_id);
CREATE INDEX IF NOT EXISTS idx_notifications_status ON notifications(status);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at DESC);

-- Create notification_templates table
CREATE TABLE IF NOT EXISTS notification_templates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL UNIQUE,
    channel VARCHAR(20) NOT NULL,
    subject_template VARCHAR(500),
    body_template TEXT NOT NULL,
    variables JSONB, -- JSON schema for required variables
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Function to update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_notifications_updated_at ON notifications;
CREATE TRIGGER update_notifications_updated_at
    BEFORE UPDATE ON notifications
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_templates_updated_at ON notification_templates;
CREATE TRIGGER update_templates_updated_at
    BEFORE UPDATE ON notification_templates
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Insert default notification templates
INSERT INTO notification_templates (name, channel, subject_template, body_template, variables)
VALUES
    ('delivery_created_customer', 'EMAIL', 'Your Delivery Request #{deliveryId}', 
     'Hi {customerName},\n\nYour delivery has been created:\n- Pickup: {pickupAddress}\n- Dropoff: {dropoffAddress}\n- Package: {packageType} ({packageWeight}kg)\n\nWe''ll notify you when a driver is assigned.\n\nThanks,\nDeliveryHub Team',
     '{"customerName": "string", "deliveryId": "string", "pickupAddress": "string", "dropoffAddress": "string", "packageType": "string", "packageWeight": "number"}'),
    
    ('driver_assigned_customer', 'EMAIL', 'Driver Assigned to Your Delivery #{deliveryId}',
     'Hi {customerName},\n\nA driver has been assigned to your delivery:\n- Driver: {driverName}\n- Phone: {driverPhone}\n- Vehicle: {vehicleType} ({licensePlate})\n- Estimated pickup: {estimatedPickupTime}\n\nYou can track the delivery in real-time.\n\nThanks,\nDeliveryHub Team',
     '{"customerName": "string", "deliveryId": "string", "driverName": "string", "driverPhone": "string", "vehicleType": "string", "licensePlate": "string", "estimatedPickupTime": "string"}'),

    ('delivery_picked_up_customer', 'EMAIL', 'Package Picked Up - Delivery #{deliveryId}',
     'Hi {customerName},\n\nYour package has been picked up by {driverName} and is on the way!\n\nEstimated delivery: {estimatedDeliveryTime}\n\nTrack your delivery: {trackingUrl}\n\nThanks,\nDeliveryHub Team',
     '{"customerName": "string", "deliveryId": "string", "driverName": "string", "estimatedDeliveryTime": "string", "trackingUrl": "string"}'),

    ('delivery_completed_customer', 'EMAIL', 'Delivery Completed - #{deliveryId}',
     'Hi {customerName},\n\nYour delivery has been completed successfully!\n- Delivered at: {deliveredAt}\n- Delivered by: {driverName}\n\nPlease rate your experience.\n\nThanks,\nDeliveryHub Team',
     '{"customerName": "string", "deliveryId": "string", "deliveredAt": "string", "driverName": "string"}'),

    ('delivery_cancelled_customer', 'EMAIL', 'Delivery Cancelled - #{deliveryId}',
     'Hi {customerName},\n\nYour delivery has been cancelled.\nReason: {cancellationReason}\n\nIf you have questions, contact support.\n\nThanks,\nDeliveryHub Team',
     '{"customerName": "string", "deliveryId": "string", "cancellationReason": "string"}'),

    -- SMS templates
    ('delivery_created_customer', 'SMS', NULL,
     'DeliveryHub: Your delivery #{deliveryId} created. Pickup: {pickupAddress}. We''ll notify when driver assigned.',
     '{"deliveryId": "string", "pickupAddress": "string"}'),

    ('driver_assigned_customer', 'SMS', NULL,
     'DeliveryHub: Driver {driverName} assigned to delivery #{deliveryId}. ETA: {estimatedPickupTime}. Track: {trackingUrl}',
     '{"driverName": "string", "deliveryId": "string", "estimatedPickupTime": "string", "trackingUrl": "string"}'),

    -- Push templates
    ('delivery_created_customer', 'PUSH', 'Delivery Created',
     'Your delivery #{deliveryId} has been created',
     '{"deliveryId": "string"}'),

    ('driver_assigned_customer', 'PUSH', 'Driver Assigned',
     '{driverName} is on the way to pick up your package',
     '{"driverName": "string", "deliveryId": "string"}')

ON CONFLICT (name) DO NOTHING;