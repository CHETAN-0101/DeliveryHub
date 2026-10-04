package com.deliveryhub.order.exception;

public class IdempotencyException extends RuntimeException {

    public IdempotencyException(String message) {
        super(message);
    }
}