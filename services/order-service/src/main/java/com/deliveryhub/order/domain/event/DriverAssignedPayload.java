package com.deliveryhub.order.domain.event;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.databind.annotation.JsonDeserialize;
import com.fasterxml.jackson.databind.annotation.JsonSerialize;
import com.fasterxml.jackson.datatype.jsr310.deser.InstantDeserializer;
import com.fasterxml.jackson.datatype.jsr310.ser.InstantSerializer;

import java.time.Instant;
import java.util.UUID;

public record DriverAssignedPayload(
    @JsonProperty("deliveryId") UUID deliveryId,
    @JsonProperty("driverId") UUID driverId,
    @JsonProperty("driverName") String driverName,
    @JsonProperty("driverPhone") String driverPhone,
    @JsonProperty("vehicleType") String vehicleType,
    @JsonProperty("licensePlate") String licensePlate,
    @JsonProperty("assignedAt") @JsonDeserialize(using = InstantDeserializer.class) @JsonSerialize(using = InstantSerializer.class) Instant assignedAt
) {
    @JsonCreator
    public DriverAssignedPayload {
    }
}