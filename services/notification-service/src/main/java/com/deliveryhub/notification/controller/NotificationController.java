package com.deliveryhub.notification.controller;

import com.deliveryhub.notification.domain.model.Notification;
import com.deliveryhub.notification.domain.model.NotificationStatus;
import com.deliveryhub.notification.domain.repository.NotificationRepository;
import com.deliveryhub.notification.dto.NotificationResponse;
import com.deliveryhub.notification.dto.PageResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

@RestController
@RequestMapping("/notifications")
@RequiredArgsConstructor
@Tag(name = "Notifications", description = "Notification management API")
@SecurityRequirement(name = "bearerAuth")
public class NotificationController {

    private final NotificationRepository notificationRepository;

    @GetMapping(value = "/{id}", produces = MediaType.APPLICATION_JSON_VALUE)
    @Operation(summary = "Get notification by ID")
    @ApiResponses({
        @ApiResponse(responseCode = "200", description = "Notification found",
                content = @Content(schema = @Schema(implementation = NotificationResponse.class))),
        @ApiResponse(responseCode = "401", description = "Unauthorized"),
        @ApiResponse(responseCode = "403", description = "Forbidden"),
        @ApiResponse(responseCode = "404", description = "Notification not found")
    })
    public ResponseEntity<NotificationResponse> getNotification(
            @Parameter(description = "Notification ID") @PathVariable UUID id) {

        Notification notification = notificationRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("Notification not found: " + id));

        return ResponseEntity.ok(mapToResponse(notification));
    }

    @GetMapping(produces = MediaType.APPLICATION_JSON_VALUE)
    @Operation(summary = "List notifications")
    @ApiResponses({
        @ApiResponse(responseCode = "200", description = "List of notifications",
                content = @Content(schema = @Schema(implementation = PageResponse.class))),
        @ApiResponse(responseCode = "401", description = "Unauthorized")
    })
    public ResponseEntity<PageResponse<NotificationResponse>> listNotifications(
            @Parameter(description = "Page number (0-based)") @RequestParam(defaultValue = "0") int page,
            @Parameter(description = "Page size") @RequestParam(defaultValue = "20") int size,
            @Parameter(description = "Filter by status") @RequestParam(required = false) NotificationStatus status,
            @Parameter(description = "Filter by delivery ID") @RequestParam(required = false) UUID deliveryId) {

        Pageable pageable = PageRequest.of(page, size, Sort.by(Sort.Direction.DESC, "createdAt"));

        Page<Notification> notifications;
        if (deliveryId != null) {
            notifications = notificationRepository.findByDeliveryId(deliveryId, pageable);
        } else if (status != null) {
            notifications = notificationRepository.findByStatus(status, pageable);
        } else {
            notifications = notificationRepository.findAll(pageable);
        }

        PageResponse<NotificationResponse> response = PageResponse.of(notifications.map(this::mapToResponse));
        return ResponseEntity.ok(response);
    }

    private NotificationResponse mapToResponse(Notification notification) {
        return new NotificationResponse(
                notification.getId(),
                notification.getDeliveryId(),
                notification.getRecipientType(),
                notification.getRecipientId(),
                notification.getChannel(),
                notification.getSubject(),
                notification.getBody(),
                notification.getTemplateName(),
                notification.getStatus(),
                notification.getErrorMessage(),
                notification.getSentAt(),
                notification.getRetryCount(),
                notification.getCreatedAt()
        );
    }
}