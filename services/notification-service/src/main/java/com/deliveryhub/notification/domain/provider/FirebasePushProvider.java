package com.deliveryhub.notification.domain.provider;

import com.deliveryhub.notification.domain.model.Notification;
import com.deliveryhub.notification.domain.model.NotificationChannel;
import com.google.firebase.messaging.FirebaseMessaging;
import com.google.firebase.messaging.FirebaseMessagingException;
import com.google.firebase.messaging.Message;
import com.google.firebase.messaging.Notification as FirebaseNotification;
import io.github.resilience4j.circuitbreaker.annotation.CircuitBreaker;
import io.github.resilience4j.retry.annotation.Retry;
import io.github.resilience4j.timelimiter.annotation.TimeLimiter;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.CompletableFuture;

@Component
@ConditionalOnProperty(prefix = "notification.firebase", name = "project-id")
public class FirebasePushProvider implements NotificationProvider {

    private static final Logger log = LoggerFactory.getLogger(FirebasePushProvider.class);

    private final FirebaseMessaging firebaseMessaging;

    public FirebasePushProvider(FirebaseMessaging firebaseMessaging) {
        this.firebaseMessaging = firebaseMessaging;
    }

    @Override
    @CircuitBreaker(name = "firebase", fallbackMethod = "sendFallback")
    @Retry(name = "firebase")
    @TimeLimiter(name = "firebase")
    public boolean send(Notification notification) {
        return sendInternal(notification);
    }

    public CompletableFuture<Boolean> sendAsync(Notification notification) {
        return CompletableFuture.supplyAsync(() -> send(notification));
    }

    private boolean sendInternal(Notification notification) {
        if (firebaseMessaging == null) {
            log.warn("Firebase not configured, skipping push for notification {}", notification.getId());
            return false;
        }

        try {
            String fcmToken = notification.getRecipientId().toString();
            
            Map<String, String> data = new HashMap<>();
            data.put("notificationId", notification.getId().toString());
            data.put("deliveryId", notification.getDeliveryId().toString());
            data.put("templateName", notification.getTemplateName());
            data.put("templateData", notification.getTemplateData());

            Message message = Message.builder()
                    .setToken(fcmToken)
                    .setNotification(FirebaseNotification.builder()
                            .setTitle(notification.getSubject())
                            .setBody(notification.getBody())
                            .build())
                    .putAllData(data)
                    .build();

            String response = firebaseMessaging.send(message);
            log.info("Push notification sent successfully via Firebase for notification {} (messageId: {})", 
                notification.getId(), response);
            return true;
        } catch (FirebaseMessagingException e) {
            log.error("Failed to send push via Firebase for notification {}", notification.getId(), e);
            throw e;
        }
    }

    private boolean sendFallback(Notification notification, Exception ex) {
        log.error("Firebase circuit breaker fallback for notification {}: {}", notification.getId(), ex.getMessage());
        return false;
    }

    @Override
    public String getChannel() {
        return NotificationChannel.PUSH.name();
    }
}