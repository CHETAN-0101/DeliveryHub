-- Notification Service Default Templates
-- This migration inserts the default notification templates for all channels

-- Insert default notification templates for EMAIL channel
INSERT INTO notification_templates (name, channel, subject_template, body_template, variables)
VALUES
    -- Delivery Created - Customer Email
    ('delivery_created_customer', 'EMAIL', 'Your Delivery Request #{deliveryId}', 
     'Hi {customerName},\n\nYour delivery has been created:\n- Pickup: {pickupAddress}\n- Dropoff: {dropoffAddress}\n- Package: {packageType} ({packageWeight}kg)\n\nWe''ll notify you when a driver is assigned.\n\nThanks,\nDeliveryHub Team',
     '{"customerName": "string", "deliveryId": "string", "pickupAddress": "string", "dropoffAddress": "string", "packageType": "string", "packageWeight": "number"}'),
     
    -- Driver Assigned - Customer Email
    ('driver_assigned_customer', 'EMAIL', 'Driver Assigned to Your Delivery #{deliveryId}',
     'Hi {customerName},\n\nA driver has been assigned to your delivery:\n- Driver: {driverName}\n- Phone: {driverPhone}\n- Vehicle: {vehicleType} ({licensePlate})\n- Estimated pickup: {estimatedPickupTime}\n\nYou can track the delivery in real-time.\n\nThanks,\nDeliveryHub Team',
     '{"customerName": "string", "deliveryId": "string", "driverName": "string", "driverPhone": "string", "vehicleType": "string", "licensePlate": "string", "estimatedPickupTime": "string"}'),

    -- Delivery Picked Up - Customer Email
    ('delivery_picked_up_customer', 'EMAIL', 'Package Picked Up - Delivery #{deliveryId}',
     'Hi {customerName},\n\nYour package has been picked up by {driverName} and is on the way!\n\nEstimated delivery: {estimatedDeliveryTime}\n\nTrack your delivery: {trackingUrl}\n\nThanks,\nDeliveryHub Team',
     '{"customerName": "string", "deliveryId": "string", "driverName": "string", "estimatedDeliveryTime": "string", "trackingUrl": "string"}'),

    -- Delivery Completed - Customer Email
    ('delivery_completed_customer', 'EMAIL', 'Delivery Completed - #{deliveryId}',
     'Hi {customerName},\n\nYour delivery has been completed successfully!\n- Delivered at: {deliveredAt}\n- Delivered by: {driverName}\n\nPlease rate your experience.\n\nThanks,\nDeliveryHub Team',
     '{"customerName": "string", "deliveryId": "string", "deliveredAt": "string", "driverName": "string"}'),

    -- Delivery Cancelled - Customer Email
    ('delivery_cancelled_customer', 'EMAIL', 'Delivery Cancelled - #{deliveryId}',
     'Hi {customerName},\n\nYour delivery has been cancelled.\nReason: {cancellationReason}\n\nIf you have questions, contact support.\n\nThanks,\nDeliveryHub Team',
     '{"customerName": "string", "deliveryId": "string", "cancellationReason": "string"}'),

    -- Delivery Created - Customer SMS
    ('delivery_created_customer', 'SMS', NULL,
     'DeliveryHub: Your delivery #{deliveryId} created. Pickup: {pickupAddress}. We''ll notify when driver assigned.',
     '{"deliveryId": "string", "pickupAddress": "string"}'),

    -- Driver Assigned - Customer SMS
    ('driver_assigned_customer', 'SMS', NULL,
     'DeliveryHub: Driver {driverName} assigned to delivery #{deliveryId}. ETA: {estimatedPickupTime}. Track: {trackingUrl}',
     '{"driverName": "string", "deliveryId": "string", "estimatedPickupTime": "string", "trackingUrl": "string"}'),

    -- Delivery Picked Up - Customer SMS
    ('delivery_picked_up_customer', 'SMS', NULL,
     'DeliveryHub: Your package picked up by {driverName}. ETA: {estimatedDeliveryTime}. Track: {trackingUrl}',
     '{"driverName": "string", "estimatedDeliveryTime": "string", "trackingUrl": "string"}'),

    -- Delivery Completed - Customer SMS
    ('delivery_completed_customer', 'SMS', NULL,
     'DeliveryHub: Delivery #{deliveryId} completed by {driverName} at {deliveredAt}. Thanks for using DeliveryHub!',
     '{"deliveryId": "string", "driverName": "string", "deliveredAt": "string"}'),

    -- Delivery Cancelled - Customer SMS
    ('delivery_cancelled_customer', 'SMS', NULL,
     'DeliveryHub: Delivery #{deliveryId} cancelled. Reason: {cancellationReason}',
     '{"deliveryId": "string", "cancellationReason": "string"}'),

    -- Delivery Created - Customer Push
    ('delivery_created_customer', 'PUSH', 'Delivery Created',
     'Your delivery #{deliveryId} has been created',
     '{"deliveryId": "string"}'),

    -- Driver Assigned - Customer Push
    ('driver_assigned_customer', 'PUSH', 'Driver Assigned',
     '{driverName} is on the way to pick up your package',
     '{"driverName": "string", "deliveryId": "string"}'),

    -- Delivery Picked Up - Customer Push
    ('delivery_picked_up_customer', 'PUSH', 'Package Picked Up',
     '{driverName} picked up your package. On the way!',
     '{"driverName": "string", "deliveryId": "string"}'),

    -- Delivery Completed - Customer Push
    ('delivery_completed_customer', 'PUSH', 'Delivery Completed',
     'Your delivery #{deliveryId} has been delivered by {driverName}',
     '{"deliveryId": "string", "driverName": "string"}'),

    -- Delivery Cancelled - Customer Push
    ('delivery_cancelled_customer', 'PUSH', 'Delivery Cancelled',
     'Your delivery #{deliveryId} was cancelled: {cancellationReason}',
     '{"deliveryId": "string", "cancellationReason": "string"}'),

    -- Driver Notifications (for driver app)
    -- New Assignment - Driver Push
    ('new_assignment_driver', 'PUSH', 'New Delivery Assignment',
     'You have a new delivery: #{deliveryId} from {pickupAddress}',
     '{"deliveryId": "string", "pickupAddress": "string"}'),

    -- Delivery Started - Driver Push (reminder)
    ('delivery_started_driver', 'PUSH', 'Delivery In Progress',
     'Delivery #{deliveryId} in transit to {dropoffAddress}',
     '{"deliveryId": "string", "dropoffAddress": "string"}'),

    -- Dispatcher Notifications (for admin dashboard)
    -- Delivery Stuck - Dispatcher Email
    ('delivery_stuck_dispatcher', 'EMAIL', 'ALERT: Delivery Stuck - #{deliveryId}',
     'Hi {dispatcherName},\n\nDelivery #{deliveryId} has been in {currentStatus} status for over {thresholdMinutes} minutes.\n- Driver: {driverName}\n- Current location: {driverLocation}\n\nPlease investigate.\n\nDeliveryHub System',
     '{"dispatcherName": "string", "deliveryId": "string", "currentStatus": "string", "thresholdMinutes": "number", "driverName": "string", "driverLocation": "string"}'),

    -- High Volume Alert - Dispatcher Email
    ('high_volume_dispatcher', 'EMAIL', 'ALERT: High Delivery Volume',
     'Hi {dispatcherName},\n\nCurrent active deliveries: {activeCount} (threshold: {threshold}).\nAvailable drivers: {availableDrivers}.\n\nConsider adding more drivers.\n\nDeliveryHub System',
     '{"dispatcherName": "string", "activeCount": "number", "threshold": "number", "availableDrivers": "number"}')

ON CONFLICT (name, channel) DO NOTHING;