package com.deliveryhub.notification.domain.service;

import com.deliveryhub.notification.domain.model.Notification;
import com.deliveryhub.notification.domain.model.NotificationChannel;
import com.deliveryhub.notification.domain.model.NotificationStatus;
import com.deliveryhub.notification.domain.repository.NotificationRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.Instant;
import java.util.concurrent.CompletableFuture;

@Service
public class NotificationSender {

    private static final Logger log = LoggerFactory.getLogger(NotificationSender.class);

    private final NotificationRepository notificationRepository;

    public NotificationSender(NotificationRepository notificationRepository) {
        this.notificationRepository = notificationRepository;
    }

    @Async
    public CompletableFuture<Void> sendAsync(Notification notification) {
        try {
            send(notification);
        } catch (Exception e) {
            log.error("Failed to send notification {}: {}", notification.getId(), e.getMessage(), e);
        }
        return CompletableFuture.completedFuture(null);
    }

    @Transactional
    public void send(Notification notification) {
        try {
            // In production, integrate with actual providers (SendGrid, Twilio, Firebase, etc.)
            // For now, simulate sending
            boolean success = simulateSend(notification);

            if (success) {
                notification.markSent();
                log.info("Notification {} sent via {}", notification.getId(), notification.getChannel());
            } else {
                notification.markFailed("Simulated send failure");
                log.warn("Notification {} failed", notification.getId());
            }

            notificationRepository.save(notification);

        } catch (Exception e) {
            notification.markFailed(e.getMessage());
            notificationRepository.save(notification);
            throw e;
        }
    }

    private boolean simulateSend(Notification notification) {
        // Simulate network delay
        try {
            Thread.sleep(100);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
        // 95% success rate
        return Math.random() > 0.05;
    }

    @Transactional
    public void retryFailedNotifications() {
        var failedNotifications = notificationRepository.findRetryableNotifications(NotificationStatus.FAILED);
        
        for (Notification notification : failedNotifications) {
            if (notification.canRetry()) {
                log.info("Retrying notification {} (attempt {}/{})", 
                    notification.getId(), notification.getRetryCount() + 1, notification.getMaxRetries());
                send(notification);
            }
        }
    }

    public void scheduleRetry(Notification notification) {
        // Calculate exponential backoff
        long delayMs = (long) (1000 * Math.pow(2, notification.getRetryCount()));
        delayMs = Math.min(delayMs, 30000); // Max 30 seconds
        
        // In production, use a proper scheduler (Quartz, Spring @Scheduled with dynamic delay)
        // For now, just log
        log.info("Scheduling retry for notification {} in {} ms", notification.getId(), delayMs);
    }
}