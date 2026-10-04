package com.deliveryhub.order.domain.event;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.databind.annotation.JsonDeserialize;
import com.fasterxml.jackson.databind.annotation.JsonSerialize;
import com.fasterxml.jackson.datatype.jsr310.deser.InstantDeserializer;
import com.fasterxml.jackson.datatype.jsr310.ser.InstantSerializer;

import java.time.Instant;
import java.util.UUID;

public record DeliveryEventEnvelope(
    @JsonProperty("eventId") UUID eventId,
    @JsonProperty("eventType") String eventType,
    @JsonProperty("version") int version,
    @JsonProperty("occurredAt") @JsonDeserialize(using = InstantDeserializer.class) @JsonSerialize(using = InstantSerializer.class) Instant occurredAt,
    @JsonProperty("aggregateId") UUID aggregateId,
    @JsonProperty("payload") Object payload
) {
    @JsonCreator
    public DeliveryEventEnvelope {
        // Validation handled by Jackson
    }

    public static <T> DeliveryEventEnvelope of(String eventType, int version, UUID aggregateId, T payload) {
        return new DeliveryEventEnvelope(UUID.randomUUID(), eventType, version, Instant.now(), aggregateId, payload);
    }
}