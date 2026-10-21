package com.deliveryhub.order.domain.model.qr;

import jakarta.persistence.*;
import org.hibernate.annotations.CreationTimestamp;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "delivery_qr_tokens", indexes = {
    @Index(name = "idx_qr_tokens_delivery_id", columnList = "delivery_id"),
    @Index(name = "idx_qr_tokens_expires_at", columnList = "expires_at"),
    @Index(name = "idx_qr_tokens_created_by", columnList = "created_by")
})
public class QrToken {

    @Id
    @GeneratedValue
    @Column(name = "id", updatable = false, nullable = false)
    private UUID id;

    @Column(name = "delivery_id", nullable = false)
    private UUID deliveryId;

    @Column(name = "token_hash", nullable = false, unique = true, length = 64)
    private String tokenHash;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "expires_at")
    private Instant expiresAt;

    @Column(name = "revoked_at")
    private Instant revokedAt;

    @Column(name = "created_by", nullable = false)
    private UUID createdBy;

    protected QrToken() {}

    public static QrToken create(UUID deliveryId, String rawToken, UUID createdBy, java.time.Duration ttl) {
        QrToken token = new QrToken();
        token.deliveryId = deliveryId;
        token.tokenHash = sha256Hex(rawToken);
        token.createdBy = createdBy;
        if (ttl != null && !ttl.isZero() && !ttl.isNegative()) {
            token.expiresAt = Instant.now().plus(ttl);
        }
        return token;
    }

    public boolean isValid() {
        return revokedAt == null && (expiresAt == null || expiresAt.isAfter(Instant.now()));
    }

    public void revoke() {
        this.revokedAt = Instant.now();
    }

    public UUID getId() { return id; }
    public UUID getDeliveryId() { return deliveryId; }
    public String getTokenHash() { return tokenHash; }
    public Instant getCreatedAt() { return createdAt; }
    public Instant getExpiresAt() { return expiresAt; }
    public Instant getRevokedAt() { return revokedAt; }
    public UUID getCreatedBy() { return createdBy; }

    public static String sha256Hex(String input) {
        try {
            java.security.MessageDigest digest = java.security.MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(input.getBytes(java.nio.charset.StandardCharsets.UTF_8));
            StringBuilder hex = new StringBuilder(64);
            for (byte b : hash) {
                hex.append(String.format("%02x", b));
            }
            return hex.toString();
        } catch (java.security.NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 not available", e);
        }
    }
}