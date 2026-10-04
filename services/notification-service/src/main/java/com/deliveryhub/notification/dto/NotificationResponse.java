package com.deliveryhub.notification.dto;

import com.deliveryhub.notification.domain.model.NotificationChannel;
import com.deliveryhub.notification.domain.model.NotificationStatus;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.databind.annotation.JsonDeserialize;
import com.fasterxml.jackson.databind.annotation.JsonSerialize;
import com.fasterxml.jackson.datatype.jsr310.deser.InstantDeserializer;
import com.fasterxml.jackson.datatype.jsr310.ser.InstantSerializer;

import java.time.Instant;
import java.util.UUID;

public record NotificationResponse(
    @JsonProperty("id") UUID id,
    @JsonProperty("deliveryId") UUID deliveryId,
    @JsonProperty("recipientType") String recipientType,
    @JsonProperty("recipientId") UUID recipientId,
    @JsonProperty("channel") NotificationChannel channel,
    @JsonProperty("subject") String subject,
    @JsonProperty("body") String body,
    @JsonProperty("templateName") String templateName,
    @JsonProperty("status") NotificationStatus status,
    @JsonProperty("errorMessage") String errorMessage,
    @JsonProperty("sentAt") @JsonDeserialize(using = InstantDeserializer.class) @JsonSerialize(using = InstantSerializer.class) Instant sentAt,
    @JsonProperty("retryCount") int retryCount,
    @JsonProperty("createdAt") @JsonDeserialize(using = InstantDeserializer.class) @JsonSerialize(using = InstantSerializer.class) Instant createdAt
) {}