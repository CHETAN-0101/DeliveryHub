package com.deliveryhub.order.domain.model.qr;

import jakarta.persistence.*;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.type.SqlTypes;
import org.hibernate.type.descriptor.jdbc.JdbcTypeCode;

import java.time.Instant;
import java.util.Map;
import java.util.UUID;

@Entity
@Table(name = "delivery_qr_scans", indexes = {
    @Index(name = "idx_qr_scans_delivery_id", columnList = "delivery_id"),
    @Index(name = "idx_qr_scans_driver_id", columnList = "driver_id"),
    @Index(name = "idx_qr_scans_scanned_at", columnList = "scanned_at"),
    @Index(name = "idx_qr_scans_token_id", columnList = "token_id"),
    @Index(name = "idx_qr_scans_action", columnList = "action"),
    @Index(name = "idx_qr_scans_result", columnList = "result")
})
public class QrScan {

    @Id
    @GeneratedValue
    @Column(name = "id", updatable = false, nullable = false)
    private UUID id;

    @Column(name = "delivery_id", nullable = false)
    private UUID deliveryId;

    @Column(name = "token_id", nullable = false)
    private UUID tokenId;

    @Column(name = "driver_id")
    private UUID driverId;

    @Enumerated(EnumType.STRING)
    @Column(name = "action", nullable = false, length = 20)
    private ScanAction action;

    @Enumerated(EnumType.STRING)
    @Column(name = "result", nullable = false, length = 20)
    private ScanResult result;

    @CreationTimestamp
    @Column(name = "scanned_at", nullable = false, updatable = false)
    private Instant scannedAt;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "metadata", columnDefinition = "jsonb")
    private Map<String, Object> metadata;

    protected QrScan() {}

    public enum ScanAction {
        PICKUP, DROPOFF, VERIFY
    }

    public enum ScanResult {
        SUCCESS, INVALID_TOKEN, EXPIRED, REVOKED, UNAUTHORIZED, WRONG_DELIVERY
    }

    public static QrScan create(UUID deliveryId, UUID tokenId, UUID driverId, ScanAction action, ScanResult result, Map<String, Object> metadata) {
        QrScan scan = new QrScan();
        scan.deliveryId = deliveryId;
        scan.tokenId = tokenId;
        scan.driverId = driverId;
        scan.action = action;
        scan.result = result;
        scan.metadata = metadata;
        return scan;
    }

    public UUID getId() { return id; }
    public UUID getDeliveryId() { return deliveryId; }
    public UUID getTokenId() { return tokenId; }
    public UUID getDriverId() { return driverId; }
    public ScanAction getAction() { return action; }
    public ScanResult getResult() { return result; }
    public Instant getScannedAt() { return scannedAt; }
    public Map<String, Object> getMetadata() { return metadata; }
}