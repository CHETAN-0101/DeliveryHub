package com.deliveryhub.order.exception;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.databind.annotation.JsonDeserialize;
import com.fasterxml.jackson.databind.annotation.JsonSerialize;
import com.fasterxml.jackson.datatype.jsr310.deser.InstantDeserializer;
import com.fasterxml.jackson.datatype.jsr310.ser.InstantSerializer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.context.request.WebRequest;

import java.time.Instant;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

@RestControllerAdvice
public class GlobalExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    @ExceptionHandler(ResourceNotFoundException.class)
    public ResponseEntity<ErrorResponse> handleNotFound(ResourceNotFoundException ex, WebRequest request) {
        return buildErrorResponse(HttpStatus.NOT_FOUND, "Not Found", ex.getMessage(), request);
    }

    @ExceptionHandler(InvalidStateException.class)
    public ResponseEntity<ErrorResponse> handleInvalidState(InvalidStateException ex, WebRequest request) {
        return buildErrorResponse(HttpStatus.CONFLICT, "Invalid State", ex.getMessage(), request);
    }

    @ExceptionHandler(IdempotencyException.class)
    public ResponseEntity<ErrorResponse> handleIdempotency(IdempotencyException ex, WebRequest request) {
        return buildErrorResponse(HttpStatus.CONFLICT, "Idempotency Conflict", ex.getMessage(), request);
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ErrorResponse> handleValidation(MethodArgumentNotValidException ex, WebRequest request) {
        Map<String, String> errors = new HashMap<>();
        ex.getBindingResult().getAllErrors().forEach(error -> {
            String fieldName = ((FieldError) error).getField();
            String errorMessage = error.getDefaultMessage();
            errors.put(fieldName, errorMessage);
        });

        ErrorResponse response = new ErrorResponse(
                UUID.randomUUID(),
                Instant.now(),
                HttpStatus.BAD_REQUEST.value(),
                "Validation Failed",
                "Request validation failed",
                request.getDescription(false).replace("uri=", ""),
                errors
        );

        return ResponseEntity.badRequest().body(response);
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<ErrorResponse> handleGeneric(Exception ex, WebRequest request) {
        log.error("Unhandled exception", ex);
        return buildErrorResponse(HttpStatus.INTERNAL_SERVER_ERROR, "Internal Server Error",
                "An unexpected error occurred", request);
    }

    private ResponseEntity<ErrorResponse> buildErrorResponse(HttpStatus status, String title, String detail, WebRequest request) {
        ErrorResponse response = new ErrorResponse(
                UUID.randomUUID(),
                Instant.now(),
                status.value(),
                title,
                detail,
                request.getDescription(false).replace("uri=", ""),
                null
        );
        return ResponseEntity.status(status).body(response);
    }

    public record ErrorResponse(
        @JsonProperty("traceId") UUID traceId,
        @JsonProperty("timestamp") @JsonDeserialize(using = InstantDeserializer.class) @JsonSerialize(using = InstantSerializer.class) Instant timestamp,
        @JsonProperty("status") int status,
        @JsonProperty("title") String title,
        @JsonProperty("detail") String detail,
        @JsonProperty("instance") String instance,
        @JsonProperty("errors") Map<String, String> errors
    ) {}
}