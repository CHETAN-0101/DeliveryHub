package com.deliveryhub.order.domain.service;

import com.deliveryhub.order.domain.event.*;
import com.deliveryhub.order.domain.model.OutboxEvent;
import com.deliveryhub.order.domain.repository.OutboxEventRepository;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.kafka.support.SendResult;
import org.springframework.retry.annotation.Backoff;
import org.springframework.retry.annotation.Retryable;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.concurrent.CompletableFuture;

@Service
@Transactional
public class OutboxPublisher {

    private static final Logger log = LoggerFactory.getLogger(OutboxPublisher.class);

    private final OutboxEventRepository outboxRepository;
    private final KafkaTemplate<String, String> kafkaTemplate;
    private final ObjectMapper objectMapper;
    private final int batchSize;

    public OutboxPublisher(OutboxEventRepository outboxRepository,
                           KafkaTemplate<String, String> kafkaTemplate,
                           ObjectMapper objectMapper,
                           @org.springframework.beans.factory.annotation.Value("${app.outbox.batch-size:100}") int batchSize) {
        this.outboxRepository = outboxRepository;
        this.kafkaTemplate = kafkaTemplate;
        this.objectMapper = objectMapper;
        this.batchSize = batchSize;
    }

    @Scheduled(fixedDelayString = "${app.outbox.poll-interval-ms:5000}")
    @Transactional
    public void publishPendingEvents() {
        List<OutboxEvent> events = outboxRepository.findUnpublishedEvents(batchSize);

        if (events.isEmpty()) {
            return;
        }

        log.debug("Publishing {} outbox events", events.size());

        for (OutboxEvent event : events) {
            try {
                publishEvent(event);
                event.markPublished();
                outboxRepository.save(event);
            } catch (Exception e) {
                log.error("Failed to publish outbox event {}: {}", event.getId(), e.getMessage(), e);
            }
        }
    }

    @Retryable(
        retryFor = Exception.class,
        maxAttempts = 3,
        backoff = @Backoff(delay = 1000, multiplier = 2)
    )
    protected void publishEvent(OutboxEvent event) {
        String topic = resolveTopic(event.getEventType());
        String key = event.getAggregateId().toString();

        CompletableFuture<SendResult<String, String>> future = kafkaTemplate.send(topic, key, event.getPayload());
        future.join(); // Wait for send to complete
    }

    private String resolveTopic(String eventType) {
        return switch (eventType) {
            case "DeliveryCreated" -> "delivery.created";
            case "DriverAssigned" -> "delivery.driver.assigned";
            case "DeliveryPickedUp" -> "delivery.picked_up";
            case "DeliveryStarted" -> "delivery.started";
            case "DeliveryCompleted" -> "delivery.completed";
            case "DeliveryCancelled" -> "delivery.cancelled";
            default -> "delivery.events";
        };
    }

    public void saveOutboxEvent(UUID aggregateId, String aggregateType, String eventType, Object payload) {
        try {
            String payloadJson = objectMapper.writeValueAsString(payload);
            OutboxEvent event = new OutboxEvent(aggregateId, aggregateType, eventType, payloadJson);
            outboxRepository.save(event);
            log.debug("Saved outbox event: {} for aggregate: {}", eventType, aggregateId);
        } catch (JsonProcessingException e) {
            log.error("Failed to serialize outbox event payload: {}", e.getMessage(), e);
            throw new RuntimeException("Failed to serialize outbox event", e);
        }
    }
}