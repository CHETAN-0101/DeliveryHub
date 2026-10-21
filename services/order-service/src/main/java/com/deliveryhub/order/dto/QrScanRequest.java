package com.deliveryhub.order.dto;

import com.deliveryhub.order.domain.model.qr.QrScan;
import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.NotNull;
import lombok.Value;

import java.util.Map;
import java.util.UUID;

@Value
public class QrScanRequest {

    @NotNull(message = "Delivery ID is required")
    @JsonProperty("deliveryId")
    UUID deliveryId;

    @NotNull(message = "Token is required")
    @JsonProperty("token")
    String token;

    @NotNull(message = "Action is required")
    @JsonProperty("action")
    QrScan.ScanAction action;

    @JsonProperty("metadata")
    Map<String, Object> metadata;
}