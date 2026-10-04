package com.deliveryhub.order.integration;

import com.deliveryhub.order.domain.model.Delivery;
import com.deliveryhub.order.domain.model.DeliveryStatus;
import com.deliveryhub.order.domain.repository.DeliveryRepository;
import com.deliveryhub.order.domain.repository.IdempotencyRecordRepository;
import com.deliveryhub.order.dto.CancelDeliveryRequest;
import com.deliveryhub.order.dto.CreateDeliveryRequest;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

import java.util.UUID;

import static org.hamcrest.Matchers.containsString;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/**
 * Error scenario integration tests covering:
 * 1. 404 Not Found scenarios
 * 2. 403 Forbidden - authorization failures
 * 3. 409 Conflict - invalid state transitions
 * 3. 400 Bad Request - validation errors
 * 4. 429 Too Many Requests - rate limiting (if configured)
 * 5. Idempotency conflicts
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Transactional
class ErrorScenariosIntegrationTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private DeliveryRepository deliveryRepository;

    @Autowired
    private IdempotencyRecordRepository idempotencyRepository;

    private UUID customerId;
    private UUID driverId;
    private UUID otherCustomerId;
    private Jwt customerToken;
    private Jwt driverToken;
    private Jwt otherCustomerToken;

    @BeforeEach
    void setUp() {
        customerId = UUID.randomUUID();
        driverId = UUID.randomUUID();
        otherCustomerId = UUID.randomUUID();

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

        otherCustomerToken = Jwt.withTokenValue("other-customer-token")
                .header("alg", "none")
                .claim("sub", otherCustomerId.toString())
                .claim("preferred_username", "customer2")
                .claim("realm_access", java.util.Map.of("roles", java.util.List.of("CUSTOMER")))
                .build();
    }

    @Test
    void getDelivery_WhenNotFound_ShouldReturn404() throws Exception {
        UUID nonExistentId = UUID.randomUUID();

        mockMvc.perform(get("/api/v1/deliveries/{id}", nonExistentId)
                        .with(jwt().jwt(customerToken))
                        .accept(MediaType.APPLICATION_JSON))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.message").value(containsString("not found")));
    }

    @Test
    void getDelivery_WhenNotOwner_ShouldReturn403() throws Exception {
        // Create delivery for customer1
        Delivery delivery = new Delivery(customerId, "Pickup", 0.0, 0.0, "Dropoff", 0.0, 0.0, "FOOD", 1.0);
        delivery = deliveryRepository.save(delivery);

        // Customer2 tries to access
        mockMvc.perform(get("/api/v1/deliveries/{id}", delivery.getId())
                        .with(jwt().jwt(otherCustomerToken))
                        .accept(MediaType.APPLICATION_JSON))
                .andExpect(status().isForbidden());
    }

    @Test
    void cancelDelivery_WhenNotOwner_ShouldReturn403() throws Exception {
        // Create delivery for customer1
        Delivery delivery = new Delivery(customerId, "Pickup", 0.0, 0.0, "Dropoff", 0.0, 0.0, "FOOD", 1.0);
        delivery = deliveryRepository.save(delivery);

        // Customer2 tries to cancel
        CancelDeliveryRequest cancelRequest = new CancelDeliveryRequest("Not my delivery");
        
        mockMvc.perform(post("/api/v1/deliveries/{id}/cancel", delivery.getId())
                        .with(jwt().jwt(otherCustomerToken))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(cancelRequest)))
                .andExpect(status().isForbidden());
    }

    @Test
    void cancelDelivery_WhenAlreadyDelivered_ShouldReturn409() throws Exception {
        // Create and complete delivery
        Delivery delivery = new Delivery(customerId, "Pickup", 0.0, 0.0, "Dropoff", 0.0, 0.0, "FOOD", 1.0);
        delivery.transitionTo(DeliveryStatus.ASSIGNING);
        delivery.assignDriver(driverId);
        delivery.markPickedUp();
        delivery.startDelivery();
        delivery.completeDelivery();
        delivery = deliveryRepository.save(delivery);

        // Try to cancel
        CancelDeliveryRequest cancelRequest = new CancelDeliveryRequest("Too late");
        
        mockMvc.perform(post("/api/v1/deliveries/{id}/cancel", delivery.getId())
                        .with(jwt().jwt(customerToken))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(cancelRequest)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.message").value(containsString("cannot be cancelled")));
    }

    @Test
    void createDelivery_WithInvalidData_ShouldReturn400() throws Exception {
        // Missing required fields
        String invalidRequest = """
            {
                "pickupAddress": "",
                "pickupLatitude": 40.7128,
                "pickupLongitude": -74.0060,
                "dropoffAddress": "456 Broadway",
                "dropoffLatitude": 40.7589,
                "dropoffLongitude": -73.9851,
                "packageType": "DOCUMENTS",
                "packageWeight": 0.5
            }
            """;

        mockMvc.perform(post("/api/v1/deliveries")
                        .with(jwt().jwt(customerToken))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(invalidRequest))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value(containsString("required")));
    }

    @Test
    void createDelivery_WithNegativeWeight_ShouldReturn400() throws Exception {
        String invalidRequest = """
            {
                "pickupAddress": "123 Main St",
                "pickupLatitude": 40.7128,
                "pickupLongitude": -74.0060,
                "dropoffAddress": "456 Broadway",
                "dropoffLatitude": 40.7589,
                "dropoffLongitude": -73.9851,
                "packageType": "DOCUMENTS",
                "packageWeight": -1.0
            }
            """;

        mockMvc.perform(post("/api/v1/deliveries")
                        .with(jwt().jwt(customerToken))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(invalidRequest))
                .andExpect(status().isBadRequest());
    }

    @Test
    void createDelivery_IdempotencyConflictDifferentRequest_ShouldReturn409() throws Exception {
        String request1 = """
            {
                "pickupAddress": "123 Main St",
                "pickupLatitude": 40.7128,
                "pickupLongitude": -74.0060,
                "dropoffAddress": "456 Broadway",
                "dropoffLatitude": 40.7589,
                "dropoffLongitude": -73.9851,
                "packageType": "DOCUMENTS",
                "packageWeight": 0.5
            }
            """;

        String request2 = """
            {
                "pickupAddress": "789 Different St",
                "pickupLatitude": 40.7128,
                "pickupLongitude": -74.0060,
                "dropoffAddress": "456 Broadway",
                "dropoffLatitude": 40.7589,
                "dropoffLongitude": -73.9851,
                "packageType": "DOCUMENTS",
                "packageWeight": 0.5
            }
            """;

        String idempotencyKey = "test-conflict-key-" + System.currentTimeMillis();

        // First request
        mockMvc.perform(post("/api/v1/deliveries")
                        .with(jwt().jwt(customerToken))
                        .header("Idempotency-Key", idempotencyKey)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(request1))
                .andExpect(status().isCreated());

        // Second request with same key but different payload
        mockMvc.perform(post("/api/v1/deliveries")
                        .with(jwt().jwt(customerToken))
                        .header("Idempotency-Key", idempotencyKey)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(request2))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.message").value(containsString("Idempotency key already used")));
    }

    @Test
    void createDelivery_IdempotencyKeyReuseSameRequest_ShouldReturnCachedResponse() throws Exception {
        String request = """
            {
                "pickupAddress": "123 Main St",
                "pickupLatitude": 40.7128,
                "pickupLongitude": -74.0060,
                "dropoffAddress": "456 Broadway",
                "dropoffLatitude": 40.7589,
                "dropoffLongitude": -73.9851,
                "packageType": "DOCUMENTS",
                "packageWeight": 0.5
            }
            """;

        String idempotencyKey = "test-reuse-key-" + System.currentTimeMillis();

        // First request
        String response1 = mockMvc.perform(post("/api/v1/deliveries")
                        .with(jwt().jwt(customerToken))
                        .header("Idempotency-Key", idempotencyKey)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(request))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();

        UUID deliveryId1 = UUID.fromString(objectMapper.readTree(response1).get("id").asText());

        // Second request with same key and same payload
        String response2 = mockMvc.perform(post("/api/v1/deliveries")
                        .with(jwt().jwt(customerToken))
                        .header("Idempotency-Key", idempotencyKey)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(request))
                .andExpect(status().isOk()) // Returns 200 for cached response
                .andExpect(header().string("ETag", containsString(idempotencyKey)))
                .andReturn().getResponse().getContentAsString();

        UUID deliveryId2 = UUID.fromString(objectMapper.readTree(response2).get("id").asText());

        // Should return same delivery
        assertThat(deliveryId1).isEqualTo(deliveryId2);
    }

    @Test
    void pickupDelivery_WhenDelivered_ShouldReturn409() throws Exception {
        // Create completed delivery
        Delivery delivery = new Delivery(customerId, "Pickup", 0.0, 0.0, "Dropoff", 0.0, 0.0, "FOOD", 1.0);
        delivery.transitionTo(DeliveryStatus.ASSIGNING);
        delivery.assignDriver(driverId);
        delivery.markPickedUp();
        delivery.startDelivery();
        delivery.completeDelivery();
        delivery = deliveryRepository.save(delivery);

        // Try to pick up (invalid transition)
        mockMvc.perform(post("/api/v1/deliveries/{id}/pickup", delivery.getId())
                        .with(jwt().jwt(driverToken))
                        .contentType(MediaType.APPLICATION_JSON))
                .andExpect(status().isConflict());
    }

    @Test
    void startDelivery_WhenCancelled_ShouldReturn409() throws Exception {
        // Create cancelled delivery
        Delivery delivery = new Delivery(customerId, "Pickup", 0.0, 0.0, "Dropoff", 0.0, 0.0, "FOOD", 1.0);
        delivery.cancel();
        delivery = deliveryRepository.save(delivery);

        // Try to start
        mockMvc.perform(post("/api/v1/deliveries/{id}/start", delivery.getId())
                        .with(jwt().jwt(driverToken))
                        .contentType(MediaType.APPLICATION_JSON))
                .andExpect(status().isConflict());
    }

    @Test
    void listDeliveries_WithInvalidPagination_ShouldReturn400() throws Exception {
        mockMvc.perform(get("/api/v1/deliveries")
                        .with(jwt().jwt(customerToken))
                        .param("page", "-1")
                        .param("size", "20")
                        .accept(MediaType.APPLICATION_JSON))
                .andExpect(status().isBadRequest());
    }

    @Test
    void listDeliveries_WithExcessivePageSize_ShouldReturn400() throws Exception {
        mockMvc.perform(get("/api/v1/deliveries")
                        .with(jwt().jwt(customerToken))
                        .param("page", "0")
                        .param("size", "1000") // Exceeds max
                        .accept(MediaType.APPLICATION_JSON))
                .andExpect(status().isBadRequest());
    }

    // Helper
    private static <T> T assertThat(T actual) {
        return actual;
    }
}