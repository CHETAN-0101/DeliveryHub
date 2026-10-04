package com.deliveryhub.order.domain.model;

import jakarta.persistence.*;
import org.hibernate.annotations.CreationTimestamp;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "delivery_events", indexes = {
    @Index(name = "idx_delivery_events_delivery_id", columnList = "delivery_id"),
    @Index(name = "idx_delivery_events_created_at", columnList = "created_at")
})
public class DeliveryEvent {

    @Id
    @GeneratedValue
    @Column(name = "id", updatable = false, nullable = false)
    private UUID id;

    @Column(name = "delivery_id", nullable = false)
    private UUID deliveryId;

    @Column(name = "event_type", nullable = false, length = 50)
    private String eventType;

    @Column(name = "old_status", length = 30)
    private String oldStatus;

    @Column(name = "new_status", length = 30)
    private String newStatus;

    @Column(name = "metadata", columnDefinition = "jsonb")
    private String metadata;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    protected DeliveryEvent() {}

    public DeliveryEvent(UUID deliveryId, String eventType, String oldStatus, String newStatus, String metadata) {
        this.deliveryId = deliveryId;
        this.eventType = eventType;
        this.oldStatus = oldStatus;
        this.newStatus = newStatus;
        this.metadata = metadata;
    }

    public UUID getId() { return id; }
    public UUID getDeliveryId() { return deliveryId; }
    public String getEventType() { return eventType; }
    public String getOldStatus() { return oldStatus; }
    public String getNewStatus() { return newStatus; }
    public String getMetadata() { return metadata; }
    public Instant getCreatedAt() { return createdAt; }
}