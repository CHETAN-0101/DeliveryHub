package com.deliveryhub.notification.domain.model;

import jakarta.persistence.*;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "notifications", indexes = {
    @Index(name = "idx_notifications_delivery_id", columnList = "delivery_id"),
    @Index(name = "idx_notifications_recipient", columnList = "recipient_type, recipient_id"),
    @Index(name = "idx_notifications_status", columnList = "status"),
    @Index(name = "idx_notifications_created_at", columnList = "created_at")
})
public class Notification {

    @Id
    @GeneratedValue
    @Column(name = "id", updatable = false, nullable = false)
    private UUID id;

    @Column(name = "delivery_id", nullable = false)
    private UUID deliveryId;

    @Column(name = "recipient_type", nullable = false, length = 20)
    private String recipientType;

    @Column(name = "recipient_id", nullable = false)
    private UUID recipientId;

    @Enumerated(EnumType.STRING)
    @Column(name = "channel", nullable = false, length = 20)
    private NotificationChannel channel;

    @Column(name = "subject", length = 500)
    private String subject;

    @Column(name = "body", nullable = false, columnDefinition = "TEXT")
    private String body;

    @Column(name = "template_name", length = 100)
    private String templateName;

    @Column(name = "template_data", columnDefinition = "jsonb")
    private String templateData;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 20)
    private NotificationStatus status = NotificationStatus.PENDING;

    @Column(name = "error_message", columnDefinition = "TEXT")
    private String errorMessage;

    @Column(name = "sent_at")
    private Instant sentAt;

    @Column(name = "retry_count", nullable = false)
    private int retryCount = 0;

    @Column(name = "max_retries", nullable = false)
    private int maxRetries = 3;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    protected Notification() {}

    public Notification(UUID deliveryId, String recipientType, UUID recipientId,
                        NotificationChannel channel, String subject, String body,
                        String templateName, String templateData, int maxRetries) {
        this.deliveryId = deliveryId;
        this.recipientType = recipientType;
        this.recipientId = recipientId;
        this.channel = channel;
        this.subject = subject;
        this.body = body;
        this.templateName = templateName;
        this.templateData = templateData;
        this.maxRetries = maxRetries;
    }

    public UUID getId() { return id; }
    public UUID getDeliveryId() { return deliveryId; }
    public String getRecipientType() { return recipientType; }
    public UUID getRecipientId() { return recipientId; }
    public NotificationChannel getChannel() { return channel; }
    public String getSubject() { return subject; }
    public String getBody() { return body; }
    public String getTemplateName() { return templateName; }
    public String getTemplateData() { return templateData; }
    public NotificationStatus getStatus() { return status; }
    public String getErrorMessage() { return errorMessage; }
    public Instant getSentAt() { return sentAt; }
    public int getRetryCount() { return retryCount; }
    public int getMaxRetries() { return maxRetries; }
    public Instant getCreatedAt() { return createdAt; }
    public Instant getUpdatedAt() { return updatedAt; }

    public void markSent() {
        this.status = NotificationStatus.SENT;
        this.sentAt = Instant.now();
    }

    public void markFailed(String errorMessage) {
        this.status = NotificationStatus.FAILED;
        this.errorMessage = errorMessage;
        this.retryCount++;
    }

    public boolean canRetry() {
        return retryCount < maxRetries && status == NotificationStatus.FAILED;
    }
}