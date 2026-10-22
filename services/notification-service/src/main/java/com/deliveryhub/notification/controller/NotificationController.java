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
import org.springframework.transaction.annotation.Transactional;
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

    /**
     * Mark a single notification as READ (sent).
     * Frontend calls: PATCH /api/v1/notifications/{id}/read
     */
    @PatchMapping(value = "/{id}/read", produces = MediaType.APPLICATION_JSON_VALUE)
    @Operation(summary = "Mark a notification as read")
    @ApiResponses({
        @ApiResponse(responseCode = "200", description = "Notification marked as read"),
        @ApiResponse(responseCode = "401", description = "Unauthorized"),
        @ApiResponse(responseCode = "404", description = "Notification not found")
    })
    @Transactional
    public ResponseEntity<java.util.Map<String, String>> markRead(
            @Parameter(description = "Notification ID") @PathVariable UUID id) {

        notificationRepository.findById(id).ifPresent(n -> {
            n.markSent(); // uses domain method which sets status=SENT and sentAt=now()
            notificationRepository.save(n);
        });

        return ResponseEntity.ok(java.util.Map.of("message", "Notification marked as read"));
    }

    /**
     * Mark all notifications as READ.
     * Frontend calls: POST /api/v1/notifications/read-all
     */
    @PostMapping(value = "/read-all", produces = MediaType.APPLICATION_JSON_VALUE)
    @Operation(summary = "Mark all notifications as read")
    @ApiResponses({
        @ApiResponse(responseCode = "200", description = "All notifications marked as read"),
        @ApiResponse(responseCode = "401", description = "Unauthorized")
    })
    @Transactional
    public ResponseEntity<java.util.Map<String, String>> markAllRead() {
        // Mark all PENDING or FAILED notifications as SENT
        java.util.List<Notification> toUpdate = notificationRepository.findAll().stream()
                .filter(n -> n.getStatus() == NotificationStatus.PENDING
                          || n.getStatus() == NotificationStatus.FAILED)
                .peek(Notification::markSent)
                .collect(java.util.stream.Collectors.toList());
        notificationRepository.saveAll(toUpdate);
        return ResponseEntity.ok(java.util.Map.of("message", "All notifications marked as read"));
    }

    /**
     * Dismiss (delete) a notification.
     * Frontend calls: DELETE /api/v1/notifications/{id}
     */
    @DeleteMapping(value = "/{id}", produces = MediaType.APPLICATION_JSON_VALUE)
    @Operation(summary = "Dismiss (delete) a notification")
    @ApiResponses({
        @ApiResponse(responseCode = "204", description = "Notification dismissed"),
        @ApiResponse(responseCode = "401", description = "Unauthorized"),
        @ApiResponse(responseCode = "404", description = "Notification not found")
    })
    @Transactional
    public ResponseEntity<Void> dismiss(
            @Parameter(description = "Notification ID") @PathVariable UUID id) {

        notificationRepository.deleteById(id);
        return ResponseEntity.noContent().build();
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