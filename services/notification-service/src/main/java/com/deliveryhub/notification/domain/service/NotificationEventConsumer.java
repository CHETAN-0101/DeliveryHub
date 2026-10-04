package com.deliveryhub.notification.domain.service;

import com.deliveryhub.notification.domain.model.Notification;
import com.deliveryhub.notification.domain.model.NotificationChannel;
import com.deliveryhub.notification.domain.model.NotificationStatus;
import com.deliveryhub.notification.domain.repository.NotificationRepository;
import com.deliveryhub.notification.domain.repository.NotificationTemplateRepository;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.kafka.support.Acknowledgment;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.Map;
import java.util.UUID;

@Service
public class NotificationEventConsumer {

    private static final Logger log = LoggerFactory.getLogger(NotificationEventConsumer.class);

    private final NotificationRepository notificationRepository;
    private final NotificationTemplateRepository templateRepository;
    private final NotificationSender notificationSender;
    private final ObjectMapper objectMapper;

    public NotificationEventConsumer(NotificationRepository notificationRepository,
                                     NotificationTemplateRepository templateRepository,
                                     NotificationSender notificationSender,
                                     ObjectMapper objectMapper) {
        this.notificationRepository = notificationRepository;
        this.templateRepository = templateRepository;
        this.notificationSender = notificationSender;
        this.objectMapper = objectMapper;
    }

    @KafkaListener(topics = "delivery.driver.assigned", groupId = "${spring.kafka.consumer.group-id}")
    @Transactional
    public void handleDriverAssigned(String message, Acknowledgment ack) {
        try {
            JsonNode event = objectMapper.readTree(message);
            UUID deliveryId = UUID.fromString(event.get("aggregateId").asText());
            JsonNode payload = event.get("payload");

            String driverName = payload.get("driverName").asText();
            String driverPhone = payload.get("driverPhone").asText();
            String vehicleType = payload.get("vehicleType").asText();
            String licensePlate = payload.get("licensePlate").asText();

            createAndSendNotification(deliveryId, "customer", "driver_assigned_customer",
                    Map.of("driverName", driverName, "driverPhone", driverPhone,
                           "vehicleType", vehicleType, "licensePlate", licensePlate));

            ack.acknowledge();
        } catch (Exception e) {
            log.error("Failed to process driver assigned event: {}", e.getMessage(), e);
            // Don't ack - will retry
        }
    }

    @KafkaListener(topics = "delivery.picked_up", groupId = "${spring.kafka.consumer.group-id}")
    @Transactional
    public void handlePickedUp(String message, Acknowledgment ack) {
        try {
            JsonNode event = objectMapper.readTree(message);
            UUID deliveryId = UUID.fromString(event.get("aggregateId").asText());

            createAndSendNotification(deliveryId, "customer", "delivery_picked_up_customer",
                    Map.of());

            ack.acknowledge();
        } catch (Exception e) {
            log.error("Failed to process picked up event: {}", e.getMessage(), e);
        }
    }

    @KafkaListener(topics = "delivery.started", groupId = "${spring.kafka.consumer.group-id}")
    @Transactional
    public void handleStarted(String message, Acknowledgment ack) {
        try {
            JsonNode event = objectMapper.readTree(message);
            UUID deliveryId = UUID.fromString(event.get("aggregateId").asText());

            createAndSendNotification(deliveryId, "customer", "delivery_started_customer",
                    Map.of());

            ack.acknowledge();
        } catch (Exception e) {
            log.error("Failed to process started event: {}", e.getMessage(), e);
        }
    }

    @KafkaListener(topics = "delivery.completed", groupId = "${spring.kafka.consumer.group-id}")
    @Transactional
    public void handleCompleted(String message, Acknowledgment ack) {
        try {
            JsonNode event = objectMapper.readTree(message);
            UUID deliveryId = UUID.fromString(event.get("aggregateId").asText());

            createAndSendNotification(deliveryId, "customer", "delivery_completed_customer",
                    Map.of("deliveredAt", Instant.now().toString()));

            ack.acknowledge();
        } catch (Exception e) {
            log.error("Failed to process completed event: {}", e.getMessage(), e);
        }
    }

    @KafkaListener(topics = "delivery.cancelled", groupId = "${spring.kafka.consumer.group-id}")
    @Transactional
    public void handleCancelled(String message, Acknowledgment ack) {
        try {
            JsonNode event = objectMapper.readTree(message);
            UUID deliveryId = UUID.fromString(event.get("aggregateId").asText());
            JsonNode payload = event.get("payload");
            String reason = payload.has("reason") ? payload.get("reason").asText() : "No reason provided";

            createAndSendNotification(deliveryId, "customer", "delivery_cancelled_customer",
                    Map.of("cancellationReason", reason));

            ack.acknowledge();
        } catch (Exception e) {
            log.error("Failed to process cancelled event: {}", e.getMessage(), e);
        }
    }

    private void createAndSendNotification(UUID deliveryId, String recipientType, String templateName, Map<String, Object> variables) {
        var templateOpt = templateRepository.findByNameAndChannel(templateName, "EMAIL");
        if (templateOpt.isEmpty()) {
            log.warn("Template not found: {} for EMAIL", templateName);
            return;
        }

        var template = templateOpt.get();
        String subject = renderTemplate(template.getSubjectTemplate(), variables);
        String body = renderTemplate(template.getBodyTemplate(), variables);

        Notification notification = new Notification(
                deliveryId, recipientType, UUID.randomUUID(), // recipientId would come from delivery
                NotificationChannel.EMAIL, subject, body, templateName, objectMapper.valueToTree(variables).toString(), 3
        );

        notificationRepository.save(notification);
        
        // Send asynchronously
        notificationSender.sendAsync(notification);
    }

    private String renderTemplate(String template, Map<String, Object> variables) {
        String result = template;
        for (Map.Entry<String, Object> entry : variables.entrySet()) {
            result = result.replace("{" + entry.getKey() + "}", entry.getValue().toString());
        }
        return result;
    }
}