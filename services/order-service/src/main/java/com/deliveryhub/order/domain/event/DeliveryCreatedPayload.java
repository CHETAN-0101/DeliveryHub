package com.deliveryhub.order.domain.event;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.databind.annotation.JsonDeserialize;
import com.fasterxml.jackson.databind.annotation.JsonSerialize;
import com.fasterxml.jackson.datatype.jsr310.deser.InstantDeserializer;
import com.fasterxml.jackson.datatype.jsr310.ser.InstantSerializer;

import java.time.Instant;
import java.util.UUID;

public record DeliveryCreatedPayload(
    @JsonProperty("deliveryId") UUID deliveryId,
    @JsonProperty("customerId") UUID customerId,
    @JsonProperty("pickupAddress") String pickupAddress,
    @JsonProperty("pickupLatitude") Double pickupLatitude,
    @JsonProperty("pickupLongitude") Double pickupLongitude,
    @JsonProperty("dropoffAddress") String dropoffAddress,
    @JsonProperty("dropoffLatitude") Double dropoffLatitude,
    @JsonProperty("dropoffLongitude") Double dropoffLongitude,
    @JsonProperty("packageType") String packageType,
    @JsonProperty("packageWeight") Double packageWeight,
    @JsonProperty("createdAt") @JsonDeserialize(using = InstantDeserializer.class) @JsonSerialize(using = InstantSerializer.class) Instant createdAt
) {
    @JsonCreator
    public DeliveryCreatedPayload {
        // Validation handled by Jackson
    }
}