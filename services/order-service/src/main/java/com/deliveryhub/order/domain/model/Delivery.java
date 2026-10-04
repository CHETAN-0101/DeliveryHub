package com.deliveryhub.order.domain.model;

import jakarta.persistence.*;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "deliveries", indexes = {
    @Index(name = "idx_deliveries_customer_id", columnList = "customer_id"),
    @Index(name = "idx_deliveries_status", columnList = "status"),
    @Index(name = "idx_deliveries_created_at", columnList = "created_at"),
    @Index(name = "idx_deliveries_driver_id", columnList = "driver_id")
})
public class Delivery {

    @Id
    @GeneratedValue
    @Column(name = "id", updatable = false, nullable = false)
    private UUID id;

    @Column(name = "customer_id", nullable = false)
    private UUID customerId;

    @Column(name = "pickup_address", nullable = false, length = 500)
    private String pickupAddress;

    @Column(name = "pickup_latitude", nullable = false)
    private Double pickupLatitude;

    @Column(name = "pickup_longitude", nullable = false)
    private Double pickupLongitude;

    @Column(name = "dropoff_address", nullable = false, length = 500)
    private String dropoffAddress;

    @Column(name = "dropoff_latitude", nullable = false)
    private Double dropoffLatitude;

    @Column(name = "dropoff_longitude", nullable = false)
    private Double dropoffLongitude;

    @Column(name = "package_type", nullable = false, length = 50)
    private String packageType;

    @Column(name = "package_weight", nullable = false)
    private Double packageWeight;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 30)
    private DeliveryStatus status = DeliveryStatus.CREATED;

    @Column(name = "driver_id")
    private UUID driverId;

    @Version
    @Column(name = "version", nullable = false)
    private Long version = 0L;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    protected Delivery() {}

    public Delivery(UUID customerId, String pickupAddress, Double pickupLatitude, Double pickupLongitude,
                    String dropoffAddress, Double dropoffLatitude, Double dropoffLongitude,
                    String packageType, Double packageWeight) {
        this.customerId = customerId;
        this.pickupAddress = pickupAddress;
        this.pickupLatitude = pickupLatitude;
        this.pickupLongitude = pickupLongitude;
        this.dropoffAddress = dropoffAddress;
        this.dropoffLatitude = dropoffLatitude;
        this.dropoffLongitude = dropoffLongitude;
        this.packageType = packageType;
        this.packageWeight = packageWeight;
    }

    public UUID getId() { return id; }
    public UUID getCustomerId() { return customerId; }
    public String getPickupAddress() { return pickupAddress; }
    public Double getPickupLatitude() { return pickupLatitude; }
    public Double getPickupLongitude() { return pickupLongitude; }
    public String getDropoffAddress() { return dropoffAddress; }
    public Double getDropoffLatitude() { return dropoffLatitude; }
    public Double getDropoffLongitude() { return dropoffLongitude; }
    public String getPackageType() { return packageType; }
    public Double getPackageWeight() { return packageWeight; }
    public DeliveryStatus getStatus() { return status; }
    public UUID getDriverId() { return driverId; }
    public Long getVersion() { return version; }
    public Instant getCreatedAt() { return createdAt; }
    public Instant getUpdatedAt() { return updatedAt; }

    public void assignDriver(UUID driverId) {
        if (this.status != DeliveryStatus.ASSIGNING) {
            throw new IllegalStateException("Delivery must be in ASSIGNING status to assign driver");
        }
        this.driverId = driverId;
        this.status = DeliveryStatus.ASSIGNED;
    }

    public void markPickedUp() {
        if (this.status != DeliveryStatus.ASSIGNED) {
            throw new IllegalStateException("Delivery must be in ASSIGNED status to mark as picked up");
        }
        this.status = DeliveryStatus.PICKED_UP;
    }

    public void startDelivery() {
        if (this.status != DeliveryStatus.PICKED_UP) {
            throw new IllegalStateException("Delivery must be in PICKED_UP status to start delivery");
        }
        this.status = DeliveryStatus.IN_TRANSIT;
    }

    public void completeDelivery() {
        if (this.status != DeliveryStatus.IN_TRANSIT) {
            throw new IllegalStateException("Delivery must be in IN_TRANSIT status to complete");
        }
        this.status = DeliveryStatus.DELIVERED;
    }

    public void cancel() {
        if (this.status.isTerminal()) {
            throw new IllegalStateException("Cannot cancel a terminal delivery");
        }
        this.status = DeliveryStatus.CANCELLED;
    }

    public void transitionTo(DeliveryStatus newStatus) {
        if (!this.status.canTransitionTo(newStatus)) {
            throw new IllegalStateException(
                String.format("Invalid status transition from %s to %s", this.status, newStatus));
        }
        this.status = newStatus;
    }

    public boolean canCancel() {
        return !status.isTerminal();
    }
}