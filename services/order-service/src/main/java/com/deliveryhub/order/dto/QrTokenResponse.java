package com.deliveryhub.order.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Value;

import java.time.Instant;
import java.util.UUID;

@Value
public class QrTokenResponse {

    @JsonProperty("tokenId")
    UUID tokenId;

    @JsonProperty("token")
    String token;

    @JsonProperty("expiresAt")
    Instant expiresAt;
}