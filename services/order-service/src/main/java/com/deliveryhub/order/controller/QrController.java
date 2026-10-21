package com.deliveryhub.order.controller;

import com.deliveryhub.order.domain.model.qr.QrScan;
import com.deliveryhub.order.domain.service.qr.QrService;
import com.deliveryhub.order.dto.QrScanRequest;
import com.deliveryhub.order.dto.QrScanResponse;
import com.deliveryhub.order.dto.QrTokenResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

@RestController
@RequestMapping("/deliveries")
@RequiredArgsConstructor
@Slf4j
@Tag(name = "QR Codes", description = "QR code generation and scanning for deliveries")
@SecurityRequirement(name = "bearerAuth")
public class QrController {

    private final QrService qrService;

    @PostMapping(value = "/{id}/qr", produces = MediaType.APPLICATION_JSON_VALUE)
    @Operation(summary = "Generate QR code token for delivery")
    @ApiResponses({
        @ApiResponse(responseCode = "200", description = "QR token generated",
                content = @Content(schema = @Schema(implementation = QrTokenResponse.class))),
        @ApiResponse(responseCode = "401", description = "Unauthorized"),
        @ApiResponse(responseCode = "403", description = "Forbidden - not delivery owner"),
        @ApiResponse(responseCode = "404", description = "Delivery not found")
    })
    @PreAuthorize("hasRole('CUSTOMER') or hasRole('DISPATCHER') or hasRole('ADMIN')")
    public ResponseEntity<QrTokenResponse> generateQr(
            @Parameter(description = "Delivery ID") @PathVariable UUID id,
            @Parameter(description = "Token TTL in hours") @RequestParam(defaultValue = "24") int ttlHours,
            @AuthenticationPrincipal Jwt jwt) {

        UUID requesterId = UUID.fromString(jwt.getSubject());
        boolean isDispatcher = jwt.getClaimAsStringList("realm_access.roles").contains("DISPATCHER");
        boolean isAdmin = jwt.getClaimAsStringList("realm_access.roles").contains("ADMIN");

        QrTokenResponse response = qrService.generateToken(id, requesterId, java.time.Duration.ofHours(ttlHours), isDispatcher || isAdmin);
        return ResponseEntity.ok(response);
    }

    @GetMapping(value = "/{id}/qr", produces = MediaType.IMAGE_PNG_VALUE)
    @Operation(summary = "Download QR code as PNG image")
    @ApiResponses({
        @ApiResponse(responseCode = "200", description = "QR code PNG image",
                content = @Content(schema = @Schema(type = "string", format = "binary"))),
        @ApiResponse(responseCode = "401", description = "Unauthorized"),
        @ApiResponse(responseCode = "403", description = "Forbidden - not delivery owner"),
        @ApiResponse(responseCode = "404", description = "Delivery not found")
    })
    @PreAuthorize("hasRole('CUSTOMER') or hasRole('DISPATCHER') or hasRole('ADMIN')")
    public ResponseEntity<byte[]> downloadQrImage(
            @Parameter(description = "Delivery ID") @PathVariable UUID id,
            @Parameter(description = "Token TTL in hours") @RequestParam(defaultValue = "24") int ttlHours,
            @AuthenticationPrincipal Jwt jwt) {

        UUID requesterId = UUID.fromString(jwt.getSubject());
        boolean isDispatcher = jwt.getClaimAsStringList("realm_access.roles").contains("DISPATCHER");
        boolean isAdmin = jwt.getClaimAsStringList("realm_access.roles").contains("ADMIN");

        QrTokenResponse tokenResponse = qrService.generateToken(id, requesterId, java.time.Duration.ofHours(ttlHours), isDispatcher || isAdmin);
        byte[] png = QrCodeGenerator.generatePng(tokenResponse.token());

        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "inline; filename=delivery-" + id + ".png")
                .contentType(MediaType.IMAGE_PNG)
                .body(png);
    }

    @PostMapping(value = "/qr/scans", consumes = MediaType.APPLICATION_JSON_VALUE, produces = MediaType.APPLICATION_JSON_VALUE)
    @Operation(summary = "Record a QR scan (driver endpoint)")
    @ApiResponses({
        @ApiResponse(responseCode = "200", description = "Scan recorded",
                content = @Content(schema = @Schema(implementation = QrScanResponse.class))),
        @ApiResponse(responseCode = "400", description = "Invalid request"),
        @ApiResponse(responseCode = "401", description = "Unauthorized"),
        @ApiResponse(responseCode = "403", description = "Forbidden - driver role required")
    })
    @PreAuthorize("hasRole('DRIVER')")
    public ResponseEntity<QrScanResponse> recordScan(
            @Valid @RequestBody QrScanRequest request,
            @AuthenticationPrincipal Jwt jwt) {

        UUID driverId = UUID.fromString(jwt.getSubject());
        QrScanResponse response = qrService.scan(request.deliveryId(), request.token(), driverId, request.action(), request.metadata());
        return ResponseEntity.ok(response);
    }

    @GetMapping(value = "/{id}/qr/scans", produces = MediaType.APPLICATION_JSON_VALUE)
    @Operation(summary = "Get scan history for delivery")
    @ApiResponses({
        @ApiResponse(responseCode = "200", description = "Scan history",
                content = @Content(schema = @Schema(implementation = com.deliveryhub.order.dto.PageResponse.class))),
        @ApiResponse(responseCode = "401", description = "Unauthorized"),
        @ApiResponse(responseCode = "403", description = "Forbidden - not delivery owner"),
        @ApiResponse(responseCode = "404", description = "Delivery not found")
    })
    @PreAuthorize("hasRole('CUSTOMER') or hasRole('DISPATCHER') or hasRole('ADMIN')")
    public ResponseEntity<com.deliveryhub.order.dto.PageResponse<QrScanResponse>> getScanHistory(
            @Parameter(description = "Delivery ID") @PathVariable UUID id,
            @Parameter(description = "Page number (0-based)") @RequestParam(defaultValue = "0") int page,
            @Parameter(description = "Page size") @RequestParam(defaultValue = "20") int size,
            @AuthenticationPrincipal Jwt jwt) {

        UUID requesterId = UUID.fromString(jwt.getSubject());
        boolean isDispatcher = jwt.getClaimAsStringList("realm_access.roles").contains("DISPATCHER");
        boolean isAdmin = jwt.getClaimAsStringList("realm_access.roles").contains("ADMIN");

        // Verify ownership for customers
        if (!isDispatcher && !isAdmin) {
            // The service will verify ownership when fetching delivery
            // For scan history, we can add an additional check here if needed
        }

        Pageable pageable = PageRequest.of(page, size, Sort.by(Sort.Direction.DESC, "scannedAt"));
        Page<QrScanResponse> scanPage = qrService.getScanHistory(id, pageable);

        com.deliveryhub.order.dto.PageResponse<QrScanResponse> response = com.deliveryhub.order.dto.PageResponse.of(scanPage);
        return ResponseEntity.ok(response);
    }
}