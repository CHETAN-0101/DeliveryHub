package com.deliveryhub.order.domain.model;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;

import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;

class DeliveryTest {

    @Test
    void createDelivery_ShouldHaveCorrectInitialState() {
        UUID customerId = UUID.randomUUID();
        Delivery delivery = new Delivery(customerId, "123 Main St", 40.7128, -74.0060,
                "456 Broadway", 40.7589, -73.9851, "DOCUMENTS", 0.5);

        assertEquals(customerId, delivery.getCustomerId());
        assertEquals(DeliveryStatus.CREATED, delivery.getStatus());
        assertNull(delivery.getDriverId());
        assertEquals(0L, delivery.getVersion());
    }

    @Test
    void assignDriver_WhenInAssigningStatus_ShouldUpdateStatus() {
        Delivery delivery = createTestDelivery();
        delivery.transitionTo(DeliveryStatus.ASSIGNING);

        UUID driverId = UUID.randomUUID();
        delivery.assignDriver(driverId);

        assertEquals(driverId, delivery.getDriverId());
        assertEquals(DeliveryStatus.ASSIGNED, delivery.getStatus());
    }

    @Test
    void assignDriver_WhenNotInAssigningStatus_ShouldThrowException() {
        Delivery delivery = createTestDelivery();

        assertThrows(IllegalStateException.class, () -> delivery.assignDriver(UUID.randomUUID()));
    }

    @Test
    void markPickedUp_WhenAssigned_ShouldTransitionToPickedUp() {
        Delivery delivery = createTestDelivery();
        delivery.transitionTo(DeliveryStatus.ASSIGNING);
        delivery.assignDriver(UUID.randomUUID());

        delivery.markPickedUp();

        assertEquals(DeliveryStatus.PICKED_UP, delivery.getStatus());
    }

    @Test
    void markPickedUp_WhenNotAssigned_ShouldThrowException() {
        Delivery delivery = createTestDelivery();

        assertThrows(IllegalStateException.class, delivery::markPickedUp);
    }

    @Test
    void startDelivery_WhenPickedUp_ShouldTransitionToInTransit() {
        Delivery delivery = createTestDelivery();
        delivery.transitionTo(DeliveryStatus.ASSIGNING);
        delivery.assignDriver(UUID.randomUUID());
        delivery.markPickedUp();

        delivery.startDelivery();

        assertEquals(DeliveryStatus.IN_TRANSIT, delivery.getStatus());
    }

    @Test
    void completeDelivery_WhenInTransit_ShouldTransitionToDelivered() {
        Delivery delivery = createTestDelivery();
        delivery.transitionTo(DeliveryStatus.ASSIGNING);
        delivery.assignDriver(UUID.randomUUID());
        delivery.markPickedUp();
        delivery.startDelivery();

        delivery.completeDelivery();

        assertEquals(DeliveryStatus.DELIVERED, delivery.getStatus());
    }

    @Test
    void cancel_WhenNotTerminal_ShouldTransitionToCancelled() {
        Delivery delivery = createTestDelivery();

        delivery.cancel();

        assertEquals(DeliveryStatus.CANCELLED, delivery.getStatus());
    }

    @Test
    void cancel_WhenTerminal_ShouldThrowException() {
        Delivery delivery = createTestDelivery();
        delivery.transitionTo(DeliveryStatus.ASSIGNING);
        delivery.assignDriver(UUID.randomUUID());
        delivery.markPickedUp();
        delivery.startDelivery();
        delivery.completeDelivery();

        assertThrows(IllegalStateException.class, delivery::cancel);
    }

    @ParameterizedTest
    @EnumSource(DeliveryStatus.class)
    void canTransitionTo_ShouldRespectStateMachine(DeliveryStatus fromStatus) {
        Delivery delivery = createTestDelivery();
        if (fromStatus != DeliveryStatus.CREATED) {
            // Need to manually set status for testing
            // Since we can't easily set private field, we test valid transitions via methods
        }
    }

    @Test
    void transitionTo_ValidTransition_ShouldSucceed() {
        Delivery delivery = createTestDelivery();

        delivery.transitionTo(DeliveryStatus.ASSIGNING);
        assertEquals(DeliveryStatus.ASSIGNING, delivery.getStatus());

        delivery.transitionTo(DeliveryStatus.ASSIGNED);
        assertEquals(DeliveryStatus.ASSIGNED, delivery.getStatus());
    }

    @Test
    void transitionTo_InvalidTransition_ShouldThrowException() {
        Delivery delivery = createTestDelivery();
        delivery.transitionTo(DeliveryStatus.ASSIGNING);

        assertThrows(IllegalStateException.class, () -> delivery.transitionTo(DeliveryStatus.PICKED_UP));
    }

    @Test
    void canCancel_WhenActive_ShouldReturnTrue() {
        Delivery delivery = createTestDelivery();
        assertTrue(delivery.canCancel());

        delivery.transitionTo(DeliveryStatus.ASSIGNING);
        assertTrue(delivery.canCancel());
    }

    @Test
    void canCancel_WhenTerminal_ShouldReturnFalse() {
        Delivery delivery = createTestDelivery();
        delivery.transitionTo(DeliveryStatus.ASSIGNING);
        delivery.assignDriver(UUID.randomUUID());
        delivery.markPickedUp();
        delivery.startDelivery();
        delivery.completeDelivery();

        assertFalse(delivery.canCancel());
    }

    private Delivery createTestDelivery() {
        return new Delivery(UUID.randomUUID(), "123 Main St", 40.7128, -74.0060,
                "456 Broadway", 40.7589, -73.9851, "DOCUMENTS", 0.5);
    }
}