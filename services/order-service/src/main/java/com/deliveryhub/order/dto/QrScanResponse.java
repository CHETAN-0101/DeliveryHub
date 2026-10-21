package com.deliveryhub.order.dto;

import com.deliveryhub.order.domain.model.qr.QrScan;
import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Value;

import java.time.Instant;
import java.util.UUID;

@Value
public class QrScanResponse {

    @JsonProperty("scanId")
    UUID scanId;

    @JsonProperty("deliveryId")
    UUID deliveryId;

    @JsonProperty("action")
    QrScan.ScanAction action;

    @JsonProperty("result")
    QrScan.ScanResult result;

    @JsonProperty("scannedAt")
    Instant scannedAt;
}