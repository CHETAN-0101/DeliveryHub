package com.deliveryhub.order.domain.event;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.databind.annotation.JsonDeserialize;
import com.fasterxml.jackson.databind.annotation.JsonSerialize;
import com.fasterxml.jackson.datatype.jsr310.deser.InstantDeserializer;
import com.fasterxml.jackson.datatype.jsr310.ser.InstantSerializer;

import java.time.Instant;
import java.util.UUID;

public record DeliveryCancelledPayload(
    @JsonProperty("deliveryId") UUID deliveryId,
    @JsonProperty("customerId") UUID customerId,
    @JsonProperty("reason") String reason,
    @JsonProperty("cancelledAt") @JsonDeserialize(using = InstantDeserializer.class) @JsonSerialize(using = InstantSerializer.class) Instant cancelledAt
) {
    @JsonCreator
    public DeliveryCancelledPayload {
    }
}