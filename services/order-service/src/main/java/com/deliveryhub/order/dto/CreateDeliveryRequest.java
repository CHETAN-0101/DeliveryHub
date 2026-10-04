package com.deliveryhub.order.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.*;
import lombok.Value;

import java.util.UUID;

@Value
public class CreateDeliveryRequest {

    @NotNull(message = "Pickup address is required")
    @Size(max = 500, message = "Pickup address must not exceed 500 characters")
    @JsonProperty("pickupAddress")
    String pickupAddress;

    @NotNull(message = "Pickup latitude is required")
    @DecimalMin(value = "-90.0", message = "Pickup latitude must be between -90 and 90")
    @DecimalMax(value = "90.0", message = "Pickup latitude must be between -90 and 90")
    @JsonProperty("pickupLatitude")
    Double pickupLatitude;

    @NotNull(message = "Pickup longitude is required")
    @DecimalMin(value = "-180.0", message = "Pickup longitude must be between -180 and 180")
    @DecimalMax(value = "180.0", message = "Pickup longitude must be between -180 and 180")
    @JsonProperty("pickupLongitude")
    Double pickupLongitude;

    @NotNull(message = "Dropoff address is required")
    @Size(max = 500, message = "Dropoff address must not exceed 500 characters")
    @JsonProperty("dropoffAddress")
    String dropoffAddress;

    @NotNull(message = "Dropoff latitude is required")
    @DecimalMin(value = "-90.0", message = "Dropoff latitude must be between -90 and 90")
    @DecimalMax(value = "90.0", message = "Dropoff latitude must be between -90 and 90")
    @JsonProperty("dropoffLatitude")
    Double dropoffLatitude;

    @NotNull(message = "Dropoff longitude is required")
    @DecimalMin(value = "-180.0", message = "Dropoff longitude must be between -180 and 180")
    @DecimalMax(value = "180.0", message = "Dropoff longitude must be between -180 and 180")
    @JsonProperty("dropoffLongitude")
    Double dropoffLongitude;

    @NotNull(message = "Package type is required")
    @Size(max = 50, message = "Package type must not exceed 50 characters")
    @JsonProperty("packageType")
    String packageType;

    @NotNull(message = "Package weight is required")
    @DecimalMin(value = "0.01", message = "Package weight must be positive")
    @DecimalMax(value = "1000.0", message = "Package weight must not exceed 1000 kg")
    @JsonProperty("packageWeight")
    Double packageWeight;
}