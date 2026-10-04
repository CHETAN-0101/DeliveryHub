package com.deliveryhub.order.domain.model;

import jakarta.persistence.*;
import org.hibernate.annotations.CreationTimestamp;

import java.time.Instant;

@Entity
@Table(name = "idempotency_records", indexes = {
    @Index(name = "idx_idempotency_expires_at", columnList = "expires_at")
})
public class IdempotencyRecord {

    @Id
    @Column(name = "idempotency_key", nullable = false, length = 255)
    private String idempotencyKey;

    @Column(name = "request_hash", nullable = false, length = 64)
    private String requestHash;

    @Column(name = "response_body", columnDefinition = "jsonb")
    private String responseBody;

    @Column(name = "response_status")
    private Integer responseStatus;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "expires_at", nullable = false)
    private Instant expiresAt;

    protected IdempotencyRecord() {}

    public IdempotencyRecord(String idempotencyKey, String requestHash, String responseBody,
                             Integer responseStatus, Instant expiresAt) {
        this.idempotencyKey = idempotencyKey;
        this.requestHash = requestHash;
        this.responseBody = responseBody;
        this.responseStatus = responseStatus;
        this.expiresAt = expiresAt;
    }

    public String getIdempotencyKey() { return idempotencyKey; }
    public String getRequestHash() { return requestHash; }
    public String getResponseBody() { return responseBody; }
    public Integer getResponseStatus() { return responseStatus; }
    public Instant getCreatedAt() { return createdAt; }
    public Instant getExpiresAt() { return expiresAt; }

    public boolean isExpired() {
        return Instant.now().isAfter(expiresAt);
    }
}