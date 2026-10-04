package com.deliveryhub.notification.domain.service;

import com.deliveryhub.notification.domain.model.Notification;
import com.deliveryhub.notification.domain.model.NotificationChannel;
import com.deliveryhub.notification.domain.model.NotificationStatus;
import com.deliveryhub.notification.domain.model.NotificationTemplate;
import com.deliveryhub.notification.domain.repository.NotificationRepository;
import com.deliveryhub.notification.domain.repository.NotificationTemplateRepository;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.kafka.support.Acknowledgment;

import java.time.Instant;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class NotificationEventConsumerTest {

    @Mock
    private NotificationRepository notificationRepository;

    @Mock
    private NotificationTemplateRepository templateRepository;

    @Mock
    private NotificationSender notificationSender;

    @Mock
    private Acknowledgment acknowledgment;

    private NotificationEventConsumer consumer;
    private ObjectMapper objectMapper;

    @BeforeEach
    void setUp() {
        objectMapper = new ObjectMapper();
        consumer = new NotificationEventConsumer(
                notificationRepository,
                templateRepository,
                notificationSender,
                objectMapper
        );
    }

    @Test
    void handleDriverAssigned_WhenTemplateExists_ShouldCreateAndSendNotification() throws Exception {
        // Arrange
        UUID deliveryId = UUID.randomUUID();
        String driverName = "John Driver";
        String driverPhone = "+15551234567";
        String vehicleType = "MOTORCYCLE";
        String licensePlate = "ABC123";

        ObjectNode event = objectMapper.createObjectNode();
        event.put("aggregateId", deliveryId.toString());
        ObjectNode payload = objectMapper.createObjectNode();
        payload.put("driverName", driverName);
        payload.put("driverPhone", driverPhone);
        payload.put("vehicleType", vehicleType);
        payload.put("licensePlate", licensePlate);
        event.set("payload", payload);

        String message = objectMapper.writeValueAsString(event);

        NotificationTemplate template = new NotificationTemplate(
                "driver_assigned_customer", "EMAIL",
                "Driver Assigned to Your Delivery #{deliveryId}",
                "Hi {customerName},\n\nDriver: {driverName}",
                objectMapper.createObjectNode()
        );

        when(templateRepository.findByNameAndChannel("driver_assigned_customer", "EMAIL"))
                .thenReturn(Optional.of(template));

        // Act
        consumer.handleDriverAssigned(message, acknowledgment);

        // Assert
        verify(acknowledgment).acknowledge();
        verify(templateRepository).findByNameAndChannel("driver_assigned_customer", "EMAIL");

        ArgumentCaptor<Notification> notificationCaptor = ArgumentCaptor.forClass(Notification.class);
        verify(notificationRepository).save(notificationCaptor.capture());
        verify(notificationSender).sendAsync(notificationCaptor.getValue());

        Notification saved = notificationCaptor.getValue();
        assertThat(saved.getDeliveryId()).isEqualTo(deliveryId);
        assertThat(saved.getChannel()).isEqualTo(NotificationChannel.EMAIL);
        assertThat(saved.getTemplateName()).isEqualTo("driver_assigned_customer");
        assertThat(saved.getSubject()).contains("Driver Assigned");
        assertThat(saved.getBody()).contains(driverName);
        assertThat(saved.getStatus()).isEqualTo(NotificationStatus.PENDING);
    }

    @Test
    void handleDriverAssigned_WhenTemplateNotFound_ShouldLogWarningAndNotSend() throws Exception {
        // Arrange
        UUID deliveryId = UUID.randomUUID();
        ObjectNode event = objectMapper.createObjectNode();
        event.put("aggregateId", deliveryId.toString());
        ObjectNode payload = objectMapper.createObjectNode();
        payload.put("driverName", "John");
        payload.put("driverPhone", "+15551234567");
        payload.put("vehicleType", "CAR");
        payload.put("licensePlate", "XYZ789");
        event.set("payload", payload);

        String message = objectMapper.writeValueAsString(event);

        when(templateRepository.findByNameAndChannel("driver_assigned_customer", "EMAIL"))
                .thenReturn(Optional.empty());

        // Act
        consumer.handleDriverAssigned(message, acknowledgment);

        // Assert
        verify(acknowledgment).acknowledge();
        verify(templateRepository).findByNameAndChannel("driver_assigned_customer", "EMAIL");
        verify(notificationRepository, never()).save(any());
        verify(notificationSender, never()).sendAsync(any());
    }

    @Test
    void handlePickedUp_WhenTemplateExists_ShouldCreateNotificationWithEmptyVariables() throws Exception {
        // Arrange
        UUID deliveryId = UUID.randomUUID();
        ObjectNode event = objectMapper.createObjectNode();
        event.put("aggregateId", deliveryId.toString());
        event.set("payload", objectMapper.createObjectNode());

        String message = objectMapper.writeValueAsString(event);

        NotificationTemplate template = new NotificationTemplate(
                "delivery_picked_up_customer", "EMAIL",
                "Package Picked Up - Delivery #{deliveryId}",
                "Your package has been picked up by {driverName}",
                objectMapper.createObjectNode()
        );

        when(templateRepository.findByNameAndChannel("delivery_picked_up_customer", "EMAIL"))
                .thenReturn(Optional.of(template));

        // Act
        consumer.handlePickedUp(message, acknowledgment);

        // Assert
        verify(acknowledgment).acknowledge();

        ArgumentCaptor<Notification> captor = ArgumentCaptor.forClass(Notification.class);
        verify(notificationRepository).save(captor.capture());

        Notification saved = captor.getValue();
        assertThat(saved.getDeliveryId()).isEqualTo(deliveryId);
        assertThat(saved.getTemplateName()).isEqualTo("delivery_picked_up_customer");
    }

    @Test
    void handleCompleted_ShouldIncludeDeliveredAtInVariables() throws Exception {
        // Arrange
        UUID deliveryId = UUID.randomUUID();
        ObjectNode event = objectMapper.createObjectNode();
        event.put("aggregateId", deliveryId.toString());
        event.set("payload", objectMapper.createObjectNode());

        String message = objectMapper.writeValueAsString(event);

        NotificationTemplate template = new NotificationTemplate(
                "delivery_completed_customer", "EMAIL",
                "Delivery Completed - #{deliveryId}",
                "Delivered at: {deliveredAt}",
                objectMapper.createObjectNode()
        );

        when(templateRepository.findByNameAndChannel("delivery_completed_customer", "EMAIL"))
                .thenReturn(Optional.of(template));

        // Act
        consumer.handleCompleted(message, acknowledgment);

        // Assert
        verify(acknowledgment).acknowledge();

        ArgumentCaptor<Notification> captor = ArgumentCaptor.forClass(Notification.class);
        verify(notificationRepository).save(captor.capture());

        Notification saved = captor.getValue();
        assertThat(saved.getTemplateData()).isNotNull();
        JsonNode templateData = objectMapper.readTree(saved.getTemplateData());
        assertThat(templateData.has("deliveredAt")).isTrue();
    }

    @Test
    void handleCancelled_WhenReasonPresent_ShouldIncludeInNotification() throws Exception {
        // Arrange
        UUID deliveryId = UUID.randomUUID();
        String reason = "Customer requested cancellation";

        ObjectNode event = objectMapper.createObjectNode();
        event.put("aggregateId", deliveryId.toString());
        ObjectNode payload = objectMapper.createObjectNode();
        payload.put("reason", reason);
        event.set("payload", payload);

        String message = objectMapper.writeValueAsString(event);

        NotificationTemplate template = new NotificationTemplate(
                "delivery_cancelled_customer", "EMAIL",
                "Delivery Cancelled - #{deliveryId}",
                "Reason: {cancellationReason}",
                objectMapper.createObjectNode()
        );

        when(templateRepository.findByNameAndChannel("delivery_cancelled_customer", "EMAIL"))
                .thenReturn(Optional.of(template));

        // Act
        consumer.handleCancelled(message, acknowledgment);

        // Assert
        verify(acknowledgment).acknowledge();

        ArgumentCaptor<Notification> captor = ArgumentCaptor.forClass(Notification.class);
        verify(notificationRepository).save(captor.capture());

        Notification saved = captor.getValue();
        JsonNode templateData = objectMapper.readTree(saved.getTemplateData());
        assertThat(templateData.get("cancellationReason").asText()).isEqualTo(reason);
    }

    @Test
    void handleCancelled_WhenReasonMissing_ShouldUseDefaultReason() throws Exception {
        // Arrange
        UUID deliveryId = UUID.randomUUID();
        ObjectNode event = objectMapper.createObjectNode();
        event.put("aggregateId", deliveryId.toString());
        event.set("payload", objectMapper.createObjectNode()); // No reason field

        String message = objectMapper.writeValueAsString(event);

        NotificationTemplate template = new NotificationTemplate(
                "delivery_cancelled_customer", "EMAIL",
                "Delivery Cancelled - #{deliveryId}",
                "Reason: {cancellationReason}",
                objectMapper.createObjectNode()
        );

        when(templateRepository.findByNameAndChannel("delivery_cancelled_customer", "EMAIL"))
                .thenReturn(Optional.of(template));

        // Act
        consumer.handleCancelled(message, acknowledgment);

        // Assert
        ArgumentCaptor<Notification> captor = ArgumentCaptor.forClass(Notification.class);
        verify(notificationRepository).save(captor.capture());

        Notification saved = captor.getValue();
        JsonNode templateData = objectMapper.readTree(saved.getTemplateData());
        assertThat(templateData.get("cancellationReason").asText()).isEqualTo("No reason provided");
    }

    @Test
    void handleDriverAssigned_WhenJsonParsingFails_ShouldNotAcknowledge() throws Exception {
        // Arrange
        String invalidJson = "{ invalid json }";

        // Act
        consumer.handleDriverAssigned(invalidJson, acknowledgment);

        // Assert
        verify(acknowledgment, never()).acknowledge();
        verify(notificationRepository, never()).save(any());
    }

    @Test
    void handleStarted_ShouldCreateNotificationWithCorrectTemplate() throws Exception {
        // Arrange
        UUID deliveryId = UUID.randomUUID();
        ObjectNode event = objectMapper.createObjectNode();
        event.put("aggregateId", deliveryId.toString());
        event.set("payload", objectMapper.createObjectNode());

        String message = objectMapper.writeValueAsString(event);

        NotificationTemplate template = new NotificationTemplate(
                "delivery_started_customer", "EMAIL",
                "Delivery Started - #{deliveryId}",
                "Your delivery is now in transit",
                objectMapper.createObjectNode()
        );

        when(templateRepository.findByNameAndChannel("delivery_started_customer", "EMAIL"))
                .thenReturn(Optional.of(template));

        // Act
        consumer.handleStarted(message, acknowledgment);

        // Assert
        verify(acknowledgment).acknowledge();

        ArgumentCaptor<Notification> captor = ArgumentCaptor.forClass(Notification.class);
        verify(notificationRepository).save(captor.capture());

        Notification saved = captor.getValue();
        assertThat(saved.getTemplateName()).isEqualTo("delivery_started_customer");
    }
}