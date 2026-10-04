package com.deliveryhub.order.domain.service;

import com.deliveryhub.order.domain.event.*;
import com.deliveryhub.order.domain.model.*;
import com.deliveryhub.order.domain.repository.*;
import com.deliveryhub.order.exception.InvalidStateException;
import com.deliveryhub.order.exception.ResourceNotFoundException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

@Service
@Transactional
public class DeliveryService {

    private static final Logger log = LoggerFactory.getLogger(DeliveryService.class);

    private final DeliveryRepository deliveryRepository;
    private final DeliveryEventRepository eventRepository;
    private final OutboxEventRepository outboxRepository;
    private final IdempotencyRecordRepository idempotencyRepository;
    private final OutboxPublisher outboxPublisher;

    public DeliveryService(DeliveryRepository deliveryRepository,
                           DeliveryEventRepository eventRepository,
                           OutboxEventRepository outboxRepository,
                           IdempotencyRecordRepository idempotencyRepository,
                           OutboxPublisher outboxPublisher) {
        this.deliveryRepository = deliveryRepository;
        this.eventRepository = eventRepository;
        this.outboxRepository = outboxRepository;
        this.idempotencyRepository = idempotencyRepository;
        this.outboxPublisher = outboxPublisher;
    }

    public Delivery createDelivery(UUID customerId, String pickupAddress, Double pickupLatitude, Double pickupLongitude,
                                   String dropoffAddress, Double dropoffLatitude, Double dropoffLongitude,
                                   String packageType, Double packageWeight) {
        Delivery delivery = new Delivery(customerId, pickupAddress, pickupLatitude, pickupLongitude,
                dropoffAddress, dropoffLatitude, dropoffLongitude, packageType, packageWeight);

        Delivery saved = deliveryRepository.save(delivery);

        recordEvent(saved.getId(), "DeliveryCreated", null, DeliveryStatus.CREATED.name(), null);
        publishOutboxEvent(saved, "DeliveryCreated", new DeliveryCreatedPayload(
                saved.getId(), saved.getCustomerId(), saved.getPickupAddress(),
                saved.getPickupLatitude(), saved.getPickupLongitude(),
                saved.getDropoffAddress(), saved.getDropoffLatitude(), saved.getDropoffLongitude(),
                saved.getPackageType(), saved.getPackageWeight(), saved.getCreatedAt()));

        log.info("Created delivery {} for customer {}", saved.getId(), customerId);
        return saved;
    }

    @Transactional(readOnly = true)
    public Delivery getDelivery(UUID id) {
        return deliveryRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Delivery not found: " + id));
    }

    @Transactional(readOnly = true)
    public Delivery getDeliveryForCustomer(UUID id, UUID customerId) {
        return deliveryRepository.findByIdAndCustomerId(id, customerId)
                .orElseThrow(() -> new ResourceNotFoundException("Delivery not found: " + id));
    }

    @Transactional(readOnly = true)
    public Page<Delivery> getDeliveries(UUID customerId, Pageable pageable) {
        if (customerId != null) {
            return deliveryRepository.findByCustomerId(customerId, pageable);
        }
        return deliveryRepository.findAll(pageable);
    }

    public Delivery cancelDelivery(UUID id, UUID customerId, String reason) {
        Delivery delivery = getDeliveryForCustomer(id, customerId);

        if (!delivery.canCancel()) {
            throw new InvalidStateException("Delivery cannot be cancelled in status: " + delivery.getStatus());
        }

        DeliveryStatus oldStatus = delivery.getStatus();
        delivery.cancel();

        Delivery saved = deliveryRepository.save(delivery);

        recordEvent(saved.getId(), "DeliveryCancelled", oldStatus.name(), saved.getStatus().name(),
                "{\"reason\": \"" + reason + "\"}");
        publishOutboxEvent(saved, "DeliveryCancelled", new DeliveryCancelledPayload(
                saved.getId(), saved.getCustomerId(), reason, Instant.now()));

        log.info("Cancelled delivery {} by customer {}", id, customerId);
        return saved;
    }

    public Delivery assignDriver(UUID deliveryId, UUID driverId, String driverName, String driverPhone,
                                 String vehicleType, String licensePlate) {
        Delivery delivery = getDelivery(deliveryId);

        if (delivery.getStatus() != DeliveryStatus.ASSIGNING) {
            throw new InvalidStateException("Delivery must be in ASSIGNING status to assign driver");
        }

        DeliveryStatus oldStatus = delivery.getStatus();
        delivery.assignDriver(driverId);

        Delivery saved = deliveryRepository.save(delivery);

        recordEvent(saved.getId(), "DriverAssigned", oldStatus.name(), saved.getStatus().name(),
                String.format("{\"driverId\": \"%s\", \"driverName\": \"%s\"}", driverId, driverName));
        publishOutboxEvent(saved, "DriverAssigned", new DriverAssignedPayload(
                saved.getId(), driverId, driverName, driverPhone, vehicleType, licensePlate, Instant.now()));

        log.info("Assigned driver {} to delivery {}", driverId, deliveryId);
        return saved;
    }

    public Delivery markPickedUp(UUID deliveryId) {
        Delivery delivery = getDelivery(deliveryId);

        DeliveryStatus oldStatus = delivery.getStatus();
        delivery.markPickedUp();

        Delivery saved = deliveryRepository.save(delivery);

        recordEvent(saved.getId(), "DeliveryPickedUp", oldStatus.name(), saved.getStatus().name(), null);
        publishOutboxEvent(saved, "DeliveryPickedUp", new DeliveryStatusChangedPayload(
                saved.getId(), oldStatus.name(), saved.getStatus().name(), saved.getDriverId(), Instant.now()));

        log.info("Delivery {} picked up by driver {}", deliveryId, delivery.getDriverId());
        return saved;
    }

    public Delivery startDelivery(UUID deliveryId) {
        Delivery delivery = getDelivery(deliveryId);

        DeliveryStatus oldStatus = delivery.getStatus();
        delivery.startDelivery();

        Delivery saved = deliveryRepository.save(delivery);

        recordEvent(saved.getId(), "DeliveryStarted", oldStatus.name(), saved.getStatus().name(), null);
        publishOutboxEvent(saved, "DeliveryStarted", new DeliveryStatusChangedPayload(
                saved.getId(), oldStatus.name(), saved.getStatus().name(), saved.getDriverId(), Instant.now()));

        log.info("Delivery {} started by driver {}", deliveryId, delivery.getDriverId());
        return saved;
    }

    public Delivery completeDelivery(UUID deliveryId) {
        Delivery delivery = getDelivery(deliveryId);

        DeliveryStatus oldStatus = delivery.getStatus();
        delivery.completeDelivery();

        Delivery saved = deliveryRepository.save(delivery);

        recordEvent(saved.getId(), "DeliveryCompleted", oldStatus.name(), saved.getStatus().name(), null);
        publishOutboxEvent(saved, "DeliveryCompleted", new DeliveryStatusChangedPayload(
                saved.getId(), oldStatus.name(), saved.getStatus().name(), saved.getDriverId(), Instant.now()));

        log.info("Delivery {} completed by driver {}", deliveryId, delivery.getDriverId());
        return saved;
    }

    public void transitionToAssigning(UUID deliveryId) {
        Delivery delivery = getDelivery(deliveryId);

        if (delivery.getStatus() != DeliveryStatus.CREATED) {
            throw new InvalidStateException("Delivery must be in CREATED status to start assignment");
        }

        DeliveryStatus oldStatus = delivery.getStatus();
        delivery.transitionTo(DeliveryStatus.ASSIGNING);

        Delivery saved = deliveryRepository.save(delivery);

        recordEvent(saved.getId(), "DeliveryAssigning", oldStatus.name(), saved.getStatus().name(), null);
        log.info("Delivery {} transitioned to ASSIGNING", deliveryId);
    }

    @Transactional(readOnly = true)
    public List<Delivery> getAssignableDeliveries() {
        return deliveryRepository.findAssignableDeliveries(List.of(DeliveryStatus.CREATED));
    }

    @Transactional(readOnly = true)
    public List<Delivery> getDeliveriesByStatus(List<DeliveryStatus> statuses) {
        return deliveryRepository.findByStatusIn(statuses);
    }

    @Transactional(readOnly = true)
    public List<Delivery> getDeliveriesByDriver(UUID driverId) {
        return deliveryRepository.findByDriverIdAndStatusIn(driverId, List.of(
                DeliveryStatus.ASSIGNED, DeliveryStatus.PICKED_UP, DeliveryStatus.IN_TRANSIT));
    }

    private void recordEvent(UUID deliveryId, String eventType, String oldStatus, String newStatus, String metadata) {
        DeliveryEvent event = new DeliveryEvent(deliveryId, eventType, oldStatus, newStatus, metadata);
        eventRepository.save(event);
    }

    private void publishOutboxEvent(Delivery delivery, String eventType, Object payload) {
        outboxPublisher.saveOutboxEvent(delivery.getId(), "Delivery", eventType, payload);
    }

    public boolean checkIdempotency(String key, String requestHash) {
        return idempotencyRepository.findByIdempotencyKey(key)
                .map(record -> {
                    if (record.isExpired()) {
                        idempotencyRepository.delete(record);
                        return false;
                    }
                    return record.getRequestHash().equals(requestHash);
                })
                .orElse(false);
    }

    public void saveIdempotencyResult(String key, String requestHash, String responseBody, int status, int ttlHours) {
        Instant expiresAt = Instant.now().plusSeconds(ttlHours * 3600L);
        IdempotencyRecord record = new IdempotencyRecord(key, requestHash, responseBody, status, expiresAt);
        idempotencyRepository.save(record);
    }

    public Optional<IdempotencyRecord> getIdempotencyRecord(String key) {
        return idempotencyRepository.findByIdempotencyKey(key);
    }
}