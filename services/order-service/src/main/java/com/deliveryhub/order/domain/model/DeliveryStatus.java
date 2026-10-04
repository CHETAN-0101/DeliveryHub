package com.deliveryhub.order.domain.model;

public enum DeliveryStatus {
    CREATED,
    ASSIGNING,
    ASSIGNED,
    PICKED_UP,
    IN_TRANSIT,
    DELIVERED,
    CANCELLED;

    public boolean canTransitionTo(DeliveryStatus newStatus) {
        return switch (this) {
            case CREATED -> newStatus == ASSIGNING || newStatus == CANCELLED;
            case ASSIGNING -> newStatus == ASSIGNED || newStatus == CANCELLED;
            case ASSIGNED -> newStatus == PICKED_UP || newStatus == CANCELLED;
            case PICKED_UP -> newStatus == IN_TRANSIT || newStatus == CANCELLED;
            case IN_TRANSIT -> newStatus == DELIVERED || newStatus == CANCELLED;
            case DELIVERED, CANCELLED -> false;
        };
    }

    public boolean isTerminal() {
        return this == DELIVERED || this == CANCELLED;
    }

    public boolean isActive() {
        return !isTerminal();
    }
}