package com.deliveryhub.order.integration;

import com.deliveryhub.order.domain.model.Delivery;
import com.deliveryhub.order.domain.model.DeliveryStatus;
import com.deliveryhub.order.domain.repository.DeliveryRepository;
import com.deliveryhub.order.domain.repository.DeliveryEventRepository;
import com.deliveryhub.order.domain.repository.IdempotencyRecordRepository;
import com.deliveryhub.order.domain.repository.OutboxEventRepository;
import com.deliveryhub.order.dto.CreateDeliveryRequest;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/**
 * Integration tests for the complete driver delivery lifecycle:
 * CREATE → ASSIGNING → ASSIGNED → PICKED_UP → IN_TRANSIT → DELIVERED
 * 
 * These tests verify:
 * 1. Driver can pick up package (POST /deliveries/{id}/pickup)
 * 2. Driver can start delivery transit (POST /deliveries/{id}/start)
 * 3. Driver can complete delivery (POST /deliveries/{id}/complete)
 * 4. Proper status transitions and event publishing
 * 5. Authorization - only assigned driver can perform actions
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Transactional
class DeliveryLifecycleIntegrationTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private DeliveryRepository deliveryRepository;

    @Autowired
    private DeliveryEventRepository eventRepository;

    @Autowired
    private OutboxEventRepository outboxRepository;

    @Autowired
    private IdempotencyRecordRepository idempotencyRepository;

    private UUID customerId;
    private UUID driverId;
    private Jwt customerToken;
    private Jwt driverToken;

    @BeforeEach
    void setUp() {
        customerId = UUID.randomUUID();
        driverId = UUID.randomUUID();
        
        // Create mock JWT tokens for customer and driver
        customerToken = Jwt.withTokenValue("customer-token")
                .header("alg", "none")
                .claim("sub", customerId.toString())
                .claim("preferred_username", "customer1")
                .claim("realm_access", java.util.Map.of("roles", java.util.List.of("CUSTOMER")))
                .build();

        driverToken = Jwt.withTokenValue("driver-token")
                .header("alg", "none")
                .claim("sub", driverId.toString())
                .claim("preferred_username", "driver1")
                .claim("realm_access", java.util.Map.of("roles", java.util.List.of("DRIVER")))
                .build();
    }

    @Test
    void completeDeliveryLifecycle_ShouldTransitionThroughAllStates() throws Exception {
        // ==========================================
        // STEP 1: Customer creates delivery
        // ==========================================
        CreateDeliveryRequest request = new CreateDeliveryRequest(
                "123 Main St, New York, NY", 40.7128, -74.0060,
                "456 Broadway, New York, NY", 40.7589, -73.9851,
                "DOCUMENTS", 0.5
        );

        String response = mockMvc.perform(post("/api/v1/deliveries")
                        .with(jwt().jwt(customerToken))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.status").value("CREATED"))
                .andReturn().getResponse().getContentAsString();

        UUID deliveryId = UUID.fromString(objectMapper.readTree(response).get("id").asText());

        // Verify delivery created in database
        Delivery delivery = deliveryRepository.findById(deliveryId).orElseThrow();
        assertThat(delivery.getStatus()).isEqualTo(DeliveryStatus.CREATED);
        assertThat(delivery.getCustomerId()).isEqualTo(customerId);

        // ==========================================
        // STEP 2: Dispatcher transitions to ASSIGNING and assigns driver
        // (Simulated via direct service call since no dispatcher endpoint)
        // ==========================================
        // In real flow, dispatch service would call assignDriver
        // For this test, we simulate the state transitions
        delivery.transitionTo(DeliveryStatus.ASSIGNING);
        delivery.assignDriver(driverId);
        delivery = deliveryRepository.save(delivery);

        assertThat(delivery.getStatus()).isEqualTo(DeliveryStatus.ASSIGNED);
        assertThat(delivery.getDriverId()).isEqualTo(driverId);

        // ==========================================
        // STEP 3: Driver picks up package
        // ==========================================
        response = mockMvc.perform(post("/api/v1/deliveries/{id}/pickup", deliveryId)
                        .with(jwt().jwt(driverToken))
                        .contentType(MediaType.APPLICATION_JSON))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("PICKED_UP"))
                .andExpect(jsonPath("$.driverId").value(driverId.toString()))
                .andReturn().getResponse().getContentAsString();

        delivery = deliveryRepository.findById(deliveryId).orElseThrow();
        assertThat(delivery.getStatus()).isEqualTo(DeliveryStatus.PICKED_UP);

        // Verify event published
        assertThat(eventRepository.existsByDeliveryIdAndEventType(deliveryId, "DeliveryPickedUp")).isTrue();
        assertThat(outboxRepository.existsByAggregateIdAndEventType(deliveryId, "DeliveryPickedUp")).isTrue();

        // ==========================================
        // STEP 4: Driver starts delivery (in transit)
        // ==========================================
        response = mockMvc.perform(post("/api/v1/deliveries/{id}/start", deliveryId)
                        .with(jwt().jwt(driverToken))
                        .contentType(MediaType.APPLICATION_JSON))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("IN_TRANSIT"))
                .andReturn().getResponse().getContentAsString();

        delivery = deliveryRepository.findById(deliveryId).orElseThrow();
        assertThat(delivery.getStatus()).isEqualTo(DeliveryStatus.IN_TRANSIT);

        // Verify event published
        assertThat(eventRepository.existsByDeliveryIdAndEventType(deliveryId, "DeliveryStarted")).isTrue();
        assertThat(outboxRepository.existsByAggregateIdAndEventType(deliveryId, "DeliveryStarted")).isTrue();

        // ==========================================
        // STEP 5: Driver completes delivery
        // ==========================================
        response = mockMvc.perform(post("/api/v1/deliveries/{id}/complete", deliveryId)
                        .with(jwt().jwt(driverToken))
                        .contentType(MediaType.APPLICATION_JSON))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("DELIVERED"))
                .andReturn().getResponse().getContentAsString();

        delivery = deliveryRepository.findById(deliveryId).orElseThrow();
        assertThat(delivery.getStatus()).isEqualTo(DeliveryStatus.DELIVERED);

        // Verify event published
        assertThat(eventRepository.existsByDeliveryIdAndEventType(deliveryId, "DeliveryCompleted")).isTrue();
        assertThat(outboxRepository.existsByAggregateIdAndEventType(deliveryId, "DeliveryCompleted")).isTrue();

        // ==========================================
        // VERIFY: All events recorded in order
        // ==========================================
        var events = eventRepository.findByDeliveryIdOrderByCreatedAtAsc(deliveryId);
        assertThat(events).hasSize(5); // Created, Assigned, PickedUp, Started, Completed
        assertThat(events.get(0).getEventType()).isEqualTo("DeliveryCreated");
        assertThat(events.get(1).getEventType()).isEqualTo("DriverAssigned");
        assertThat(events.get(2).getEventType()).isEqualTo("DeliveryPickedUp");
        assertThat(events.get(3).getEventType()).isEqualTo("DeliveryStarted");
        assertThat(events.get(4).getEventType()).isEqualTo("DeliveryCompleted");
    }

    @Test
    void pickupDelivery_WhenNotAssignedDriver_ShouldReturn403() throws Exception {
        // Arrange: Create delivery assigned to driver1
        UUID otherDriverId = UUID.randomUUID();
        Delivery delivery = new Delivery(customerId, "Pickup", 0.0, 0.0, "Dropoff", 0.0, 0.0, "DOCUMENTS", 1.0);
        delivery.transitionTo(DeliveryStatus.ASSIGNING);
        delivery.assignDriver(otherDriverId);
        delivery = deliveryRepository.save(delivery);

        // Act & Assert: driver2 tries to pick up
        Jwt otherDriverToken = Jwt.withTokenValue("other-driver-token")
                .header("alg", "none")
                .claim("sub", UUID.randomUUID().toString())
                .claim("realm_access", java.util.Map.of("roles", java.util.List.of("DRIVER")))
                .build();

        mockMvc.perform(post("/api/v1/deliveries/{id}/pickup", delivery.getId())
                        .with(jwt().jwt(otherDriverToken))
                        .contentType(MediaType.APPLICATION_JSON))
                .andExpect(status().isForbidden());
    }

    @Test
    void pickupDelivery_WhenCustomerTries_ShouldReturn403() throws Exception {
        // Arrange: Create delivery assigned to driver
        Delivery delivery = new Delivery(customerId, "Pickup", 0.0, 0.0, "Dropoff", 0.0, 0.0, "DOCUMENTS", 1.0);
        delivery.transitionTo(DeliveryStatus.ASSIGNING);
        delivery.assignDriver(driverId);
        delivery = deliveryRepository.save(delivery);

        // Act & Assert: Customer tries to pick up
        mockMvc.perform(post("/api/v1/deliveries/{id}/pickup", delivery.getId())
                        .with(jwt().jwt(customerToken))
                        .contentType(MediaType.APPLICATION_JSON))
                .andExpect(status().isForbidden());
    }

    @Test
    void startDelivery_WhenNotPickedUp_ShouldReturn409() throws Exception {
        // Arrange: Delivery is ASSIGNED but not PICKED_UP
        Delivery delivery = new Delivery(customerId, "Pickup", 0.0, 0.0, "Dropoff", 0.0, 0.0, "DOCUMENTS", 1.0);
        delivery.transitionTo(DeliveryStatus.ASSIGNING);
        delivery.assignDriver(driverId);
        delivery = deliveryRepository.save(delivery);

        // Act & Assert: Try to start without picking up
        mockMvc.perform(post("/api/v1/deliveries/{id}/start", delivery.getId())
                        .with(jwt().jwt(driverToken))
                        .contentType(MediaType.APPLICATION_JSON))
                .andExpect(status().isConflict());
    }

    @Test
    void completeDelivery_WhenNotInTransit_ShouldReturn409() throws Exception {
        // Arrange: Delivery is PICKED_UP but not IN_TRANSIT
        Delivery delivery = new Delivery(customerId, "Pickup", 0.0, 0.0, "Dropoff", 0.0, 0.0, "DOCUMENTS", 1.0);
        delivery.transitionTo(DeliveryStatus.ASSIGNING);
        delivery.assignDriver(driverId);
        delivery.markPickedUp();
        delivery = deliveryRepository.save(delivery);

        // Act & Assert: Try to complete without starting transit
        mockMvc.perform(post("/api/v1/deliveries/{id}/complete", delivery.getId())
                        .with(jwt().jwt(driverToken))
                        .contentType(MediaType.APPLICATION_JSON))
                .andExpect(status().isConflict());
    }

    @Test
    void pickupDelivery_WhenDeliveryNotFound_ShouldReturn404() throws Exception {
        UUID nonExistentId = UUID.randomUUID();

        mockMvc.perform(post("/api/v1/deliveries/{id}/pickup", nonExistentId)
                        .with(jwt().jwt(driverToken))
                        .contentType(MediaType.APPLICATION_JSON))
                .andExpect(status().isNotFound());
    }

    @Test
    void completeDelivery_WhenAlreadyDelivered_ShouldReturn409() throws Exception {
        // Arrange: Delivery already completed
        Delivery delivery = new Delivery(customerId, "Pickup", 0.0, 0.0, "Dropoff", 0.0, 0.0, "DOCUMENTS", 1.0);
        delivery.transitionTo(DeliveryStatus.ASSIGNING);
        delivery.assignDriver(driverId);
        delivery.markPickedUp();
        delivery.startDelivery();
        delivery.completeDelivery();
        delivery = deliveryRepository.save(delivery);

        // Act & Assert: Try to complete again
        mockMvc.perform(post("/api/v1/deliveries/{id}/complete", delivery.getId())
                        .with(jwt().jwt(driverToken))
                        .contentType(MediaType.APPLICATION_JSON))
                .andExpect(status().isConflict());
    }

    @Test
    void deliveryEvents_ShouldCaptureFullAuditTrail() throws Exception {
        // Create delivery
        CreateDeliveryRequest request = new CreateDeliveryRequest(
                "Pickup Address", 0.0, 0.0, "Dropoff Address", 0.0, 0.0, "FOOD", 2.0
        );

        String response = mockMvc.perform(post("/api/v1/deliveries")
                        .with(jwt().jwt(customerToken))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();

        UUID deliveryId = UUID.fromString(objectMapper.readTree(response).get("id").asText());

        // Assign driver
        Delivery delivery = deliveryRepository.findById(deliveryId).orElseThrow();
        delivery.transitionTo(DeliveryStatus.ASSIGNING);
        delivery.assignDriver(driverId);
        deliveryRepository.save(delivery);

        // Complete lifecycle
        mockMvc.perform(post("/api/v1/deliveries/{id}/pickup", deliveryId)
                        .with(jwt().jwt(driverToken))).andExpect(status().isOk());
        
        mockMvc.perform(post("/api/v1/deliveries/{id}/start", deliveryId)
                        .with(jwt().jwt(driverToken))).andExpect(status().isOk());
        
        mockMvc.perform(post("/api/v1/deliveries/{id}/complete", deliveryId)
                        .with(jwt().jwt(driverToken))).andExpect(status().isOk());

        // Verify all events have correct metadata
        var events = eventRepository.findByDeliveryIdOrderByCreatedAtAsc(deliveryId);
        
        // Created event
        assertThat(events.get(0).getOldStatus()).isNull();
        assertThat(events.get(0).getNewStatus()).isEqualTo("CREATED");
        
        // Assigned event
        assertThat(events.get(1).getOldStatus()).isEqualTo("ASSIGNING");
        assertThat(events.get(1).getNewStatus()).isEqualTo("ASSIGNED");
        assertThat(events.get(1).getMetadata()).contains(driverId.toString());
        
        // Picked up event
        assertThat(events.get(2).getOldStatus()).isEqualTo("ASSIGNED");
        assertThat(events.get(2).getNewStatus()).isEqualTo("PICKED_UP");
        
        // Started event
        assertThat(events.get(3).getOldStatus()).isEqualTo("PICKED_UP");
        assertThat(events.get(3).getNewStatus()).isEqualTo("IN_TRANSIT");
        
        // Completed event
        assertThat(events.get(4).getOldStatus()).isEqualTo("IN_TRANSIT");
        assertThat(events.get(4).getNewStatus()).isEqualTo("DELIVERED");
    }
}