package com.deliveryhub.order.controller;

import com.deliveryhub.order.dto.*;
import com.deliveryhub.order.domain.model.Delivery;
import com.deliveryhub.order.domain.model.DeliveryStatus;
import com.deliveryhub.order.domain.service.DeliveryService;
import com.deliveryhub.order.exception.IdempotencyException;
import io.micrometer.core.annotation.Timed;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.Base64;
import java.util.UUID;

@RestController
@RequestMapping("/deliveries")
@RequiredArgsConstructor
@Slf4j
@Tag(name = "Deliveries", description = "Delivery management API")
@SecurityRequirement(name = "bearerAuth")
public class DeliveryController {

    private final DeliveryService deliveryService;

    @PostMapping(consumes = MediaType.APPLICATION_JSON_VALUE, produces = MediaType.APPLICATION_JSON_VALUE)
    @Operation(summary = "Create a new delivery", description = "Creates a delivery request with idempotency support")
    @ApiResponses({
        @ApiResponse(responseCode = "201", description = "Delivery created",
                content = @Content(schema = @Schema(implementation = DeliveryResponse.class))),
        @ApiResponse(responseCode = "400", description = "Invalid request"),
        @ApiResponse(responseCode = "401", description = "Unauthorized"),
        @ApiResponse(responseCode = "409", description = "Idempotency conflict or invalid state"),
        @ApiResponse(responseCode = "429", description = "Too many requests")
    })
    @Timed(value = "delivery.creation", description = "Time taken to create delivery")
    public ResponseEntity<DeliveryResponse> createDelivery(
            @Valid @RequestBody CreateDeliveryRequest request,
            @RequestHeader(value = "Idempotency-Key", required = false) String idempotencyKey,
            @AuthenticationPrincipal Jwt jwt,
            HttpServletRequest httpRequest) {

        UUID customerId = getCustomerIdFromToken(jwt);

        if (idempotencyKey != null) {
            String requestHash = computeRequestHash(request);
            if (deliveryService.checkIdempotency(idempotencyKey, requestHash)) {
                var existing = deliveryService.getIdempotencyRecord(idempotencyKey);
                if (existing.isPresent()) {
                    log.info("Returning cached response for idempotency key: {}", idempotencyKey);
                    return ResponseEntity.status(HttpStatus.OK)
                            .header(HttpHeaders.ETAG, "\"" + idempotencyKey + "\"")
                            .body(deliveryService.getDelivery(UUID.fromString(existing.get().getResponseBody())));
                }
                throw new IdempotencyException("Idempotency key already used with different request");
            }
        }

        Delivery delivery = deliveryService.createDelivery(
                customerId,
                request.pickupAddress(),
                request.pickupLatitude(),
                request.pickupLongitude(),
                request.dropoffAddress(),
                request.dropoffLatitude(),
                request.dropoffLongitude(),
                request.packageType(),
                request.packageWeight()
        );

        DeliveryResponse response = mapToResponse(delivery);

        if (idempotencyKey != null) {
            String requestHash = computeRequestHash(request);
            String responseBody = delivery.getId().toString();
            deliveryService.saveIdempotencyResult(idempotencyKey, requestHash, responseBody, HttpStatus.CREATED.value(), 24);
        }

        return ResponseEntity.status(HttpStatus.CREATED)
                .header(HttpHeaders.LOCATION, "/api/v1/deliveries/" + delivery.getId())
                .body(response);
    }

    @GetMapping(value = "/{id}", produces = MediaType.APPLICATION_JSON_VALUE)
    @Operation(summary = "Get delivery by ID")
    @ApiResponses({
        @ApiResponse(responseCode = "200", description = "Delivery found",
                content = @Content(schema = @Schema(implementation = DeliveryResponse.class))),
        @ApiResponse(responseCode = "401", description = "Unauthorized"),
        @ApiResponse(responseCode = "403", description = "Forbidden - not owner"),
        @ApiResponse(responseCode = "404", description = "Delivery not found")
    })
    @Timed(value = "delivery.get", description = "Time taken to get delivery")
    public ResponseEntity<DeliveryResponse> getDelivery(
            @Parameter(description = "Delivery ID") @PathVariable UUID id,
            @AuthenticationPrincipal Jwt jwt) {

        UUID customerId = getCustomerIdFromToken(jwt);
        Delivery delivery = deliveryService.getDeliveryForCustomer(id, customerId);
        return ResponseEntity.ok(mapToResponse(delivery));
    }

    @GetMapping(produces = MediaType.APPLICATION_JSON_VALUE)
    @Operation(summary = "List deliveries for authenticated customer")
    @ApiResponses({
        @ApiResponse(responseCode = "200", description = "List of deliveries",
                content = @Content(schema = @Schema(implementation = PageResponse.class))),
        @ApiResponse(responseCode = "401", description = "Unauthorized")
    })
    @Timed(value = "delivery.list", description = "Time taken to list deliveries")
    public ResponseEntity<PageResponse<DeliveryResponse>> listDeliveries(
            @Parameter(description = "Page number (0-based)") @RequestParam(defaultValue = "0") int page,
            @Parameter(description = "Page size") @RequestParam(defaultValue = "20") int size,
            @AuthenticationPrincipal Jwt jwt) {

        UUID customerId = getCustomerIdFromToken(jwt);
        Pageable pageable = PageRequest.of(page, size, Sort.by(Sort.Direction.DESC, "createdAt"));
        Page<Delivery> deliveries = deliveryService.getDeliveries(customerId, pageable);

        PageResponse<DeliveryResponse> response = PageResponse.of(deliveries.map(this::mapToResponse));
        return ResponseEntity.ok(response);
    }

    @PostMapping(value = "/{id}/cancel", consumes = MediaType.APPLICATION_JSON_VALUE, produces = MediaType.APPLICATION_JSON_VALUE)
    @Operation(summary = "Cancel a delivery")
    @ApiResponses({
        @ApiResponse(responseCode = "200", description = "Delivery cancelled",
                content = @Content(schema = @Schema(implementation = DeliveryResponse.class))),
        @ApiResponse(responseCode = "400", description = "Invalid request"),
        @ApiResponse(responseCode = "401", description = "Unauthorized"),
        @ApiResponse(responseCode = "403", description = "Forbidden"),
        @ApiResponse(responseCode = "404", description = "Delivery not found"),
        @ApiResponse(responseCode = "409", description = "Delivery cannot be cancelled in current state")
    })
    @Timed(value = "delivery.cancel", description = "Time taken to cancel delivery")
    public ResponseEntity<DeliveryResponse> cancelDelivery(
            @Parameter(description = "Delivery ID") @PathVariable UUID id,
            @Valid @RequestBody CancelDeliveryRequest request,
            @AuthenticationPrincipal Jwt jwt) {

        UUID customerId = getCustomerIdFromToken(jwt);
        Delivery delivery = deliveryService.cancelDelivery(id, customerId, request.reason());
        return ResponseEntity.ok(mapToResponse(delivery));
    }

    private DeliveryResponse mapToResponse(Delivery delivery) {
        return new DeliveryResponse(
                delivery.getId(),
                delivery.getCustomerId(),
                delivery.getPickupAddress(),
                delivery.getPickupLatitude(),
                delivery.getPickupLongitude(),
                delivery.getDropoffAddress(),
                delivery.getDropoffLatitude(),
                delivery.getDropoffLongitude(),
                delivery.getPackageType(),
                delivery.getPackageWeight(),
                delivery.getStatus(),
                delivery.getDriverId(),
                delivery.getCreatedAt(),
                delivery.getUpdatedAt()
        );
    }

    private UUID getCustomerIdFromToken(Jwt jwt) {
        String sub = jwt.getSubject();
        return UUID.fromString(sub);
    }

    private String computeRequestHash(CreateDeliveryRequest request) {
        try {
            String json = new com.fasterxml.jackson.databind.ObjectMapper().writeValueAsString(request);
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(json.getBytes(StandardCharsets.UTF_8));
            return Base64.getEncoder().encodeToString(hash);
        } catch (Exception e) {
            throw new RuntimeException("Failed to compute request hash", e);
        }
    }

    /**
     * Driver picks up the package for delivery.
     * Only the assigned driver can call this endpoint.
     * Transitions delivery status from ASSIGNED to PICKED_UP.
     */
    @PostMapping(value = "/{id}/pickup", produces = MediaType.APPLICATION_JSON_VALUE)
    @Operation(summary = "Mark delivery as picked up", description = "Driver confirms package pickup. Transitions status to PICKED_UP.")
    @ApiResponses({
        @ApiResponse(responseCode = "200", description = "Delivery picked up",
                content = @Content(schema = @Schema(implementation = DeliveryResponse.class))),
        @ApiResponse(responseCode = "401", description = "Unauthorized"),
        @ApiResponse(responseCode = "403", description = "Forbidden - not assigned driver"),
        @ApiResponse(responseCode = "404", description = "Delivery not found"),
        @ApiResponse(responseCode = "409", description = "Delivery not in ASSIGNED status")
    })
    @Timed(value = "delivery.pickup", description = "Time taken to mark delivery as picked up")
    public ResponseEntity<DeliveryResponse> pickupDelivery(
            @Parameter(description = "Delivery ID") @PathVariable UUID id,
            @AuthenticationPrincipal Jwt jwt) {

        UUID driverId = getDriverIdFromToken(jwt);
        Delivery delivery = deliveryService.getDelivery(id);

        // Verify this driver is assigned to this delivery
        if (!driverId.equals(delivery.getDriverId())) {
            throw new org.springframework.security.access.AccessDeniedException("Not assigned to this delivery");
        }

        Delivery updated = deliveryService.markPickedUp(id);
        return ResponseEntity.ok(mapToResponse(updated));
    }

    /**
     * Driver starts the delivery (begins transit to dropoff).
     * Only the assigned driver can call this endpoint.
     * Transitions delivery status from PICKED_UP to IN_TRANSIT.
     */
    @PostMapping(value = "/{id}/start", produces = MediaType.APPLICATION_JSON_VALUE)
    @Operation(summary = "Start delivery transit", description = "Driver starts delivery transit. Transitions status to IN_TRANSIT.")
    @ApiResponses({
        @ApiResponse(responseCode = "200", description = "Delivery started",
                content = @Content(schema = @Schema(implementation = DeliveryResponse.class))),
        @ApiResponse(responseCode = "401", description = "Unauthorized"),
        @ApiResponse(responseCode = "403", description = "Forbidden - not assigned driver"),
        @ApiResponse(responseCode = "404", description = "Delivery not found"),
        @ApiResponse(responseCode = "409", description = "Delivery not in PICKED_UP status")
    })
    @Timed(value = "delivery.start", description = "Time taken to start delivery")
    public ResponseEntity<DeliveryResponse> startDelivery(
            @Parameter(description = "Delivery ID") @PathVariable UUID id,
            @AuthenticationPrincipal Jwt jwt) {

        UUID driverId = getDriverIdFromToken(jwt);
        Delivery delivery = deliveryService.getDelivery(id);

        // Verify this driver is assigned to this delivery
        if (!driverId.equals(delivery.getDriverId())) {
            throw new org.springframework.security.access.AccessDeniedException("Not assigned to this delivery");
        }

        Delivery updated = deliveryService.startDelivery(id);
        return ResponseEntity.ok(mapToResponse(updated));
    }

    /**
     * Driver completes the delivery.
     * Only the assigned driver can call this endpoint.
     * Transitions delivery status from IN_TRANSIT to DELIVERED.
     */
    @PostMapping(value = "/{id}/complete", produces = MediaType.APPLICATION_JSON_VALUE)
    @Operation(summary = "Complete delivery", description = "Driver completes delivery. Transitions status to DELIVERED.")
    @ApiResponses({
        @ApiResponse(responseCode = "200", description = "Delivery completed",
                content = @Content(schema = @Schema(implementation = DeliveryResponse.class))),
        @ApiResponse(responseCode = "401", description = "Unauthorized"),
        @ApiResponse(responseCode = "403", description = "Forbidden - not assigned driver"),
        @ApiResponse(responseCode = "404", description = "Delivery not found"),
        @ApiResponse(responseCode = "409", description = "Delivery not in IN_TRANSIT status")
    })
    @Timed(value = "delivery.complete", description = "Time taken to complete delivery")
    public ResponseEntity<DeliveryResponse> completeDelivery(
            @Parameter(description = "Delivery ID") @PathVariable UUID id,
            @AuthenticationPrincipal Jwt jwt) {

        UUID driverId = getDriverIdFromToken(jwt);
        Delivery delivery = deliveryService.getDelivery(id);

        // Verify this driver is assigned to this delivery
        if (!driverId.equals(delivery.getDriverId())) {
            throw new org.springframework.security.access.AccessDeniedException("Not assigned to this delivery");
        }

        Delivery updated = deliveryService.completeDelivery(id);
        return ResponseEntity.ok(mapToResponse(updated));
    }

    /**
     * Extract driver ID from JWT token.
     * Expects the 'sub' claim to contain the driver UUID.
     */
    private UUID getDriverIdFromToken(Jwt jwt) {
        String sub = jwt.getSubject();
        return UUID.fromString(sub);
    }
}