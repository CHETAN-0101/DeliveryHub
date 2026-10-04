package com.deliveryhub.order.domain.event;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.databind.annotation.JsonDeserialize;
import com.fasterxml.jackson.databind.annotation.JsonSerialize;
import com.fasterxml.jackson.datatype.jsr310.deser.InstantDeserializer;
import com.fasterxml.jackson.datatype.jsr310.ser.InstantSerializer;

import java.time.Instant;
import java.util.UUID;

public record DeliveryStatusChangedPayload(
    @JsonProperty("deliveryId") UUID deliveryId,
    @JsonProperty("oldStatus") String oldStatus,
    @JsonProperty("newStatus") String newStatus,
    @JsonProperty("driverId") UUID driverId,
    @JsonProperty("changedAt") @JsonDeserialize(using = InstantDeserializer.class) @JsonSerialize(using = InstantSerializer.class) Instant changedAt
) {
    @JsonCreator
    public DeliveryStatusChangedPayload {
    }
}