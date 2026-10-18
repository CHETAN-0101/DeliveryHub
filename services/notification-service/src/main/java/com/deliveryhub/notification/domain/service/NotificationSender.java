package com.deliveryhub.notification.domain.service;

import com.deliveryhub.notification.domain.model.Notification;
import com.deliveryhub.notification.domain.model.NotificationChannel;
import com.deliveryhub.notification.domain.model.NotificationStatus;
import com.deliveryhub.notification.domain.provider.NotificationProvider;
import com.deliveryhub.notification.domain.repository.NotificationRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.scheduling.TaskScheduler;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import jakarta.annotation.PostConstruct;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ScheduledFuture;

@Service
public class NotificationSender {

    private static final Logger log = LoggerFactory.getLogger(NotificationSender.class);

    private final NotificationRepository notificationRepository;
    private final TaskScheduler taskScheduler;
    
    private final Map<String, NotificationProvider> providers = new ConcurrentHashMap<>();
    private final Map<String, ScheduledFuture<?>> scheduledRetries = new ConcurrentHashMap<>();

    @Autowired
    public NotificationSender(NotificationRepository notificationRepository,
                               TaskScheduler taskScheduler) {
        this.notificationRepository = notificationRepository;
        this.taskScheduler = taskScheduler;
    }

    @PostConstruct
    public void initProviders() {
        log.info("NotificationSender initialized, waiting for providers to be registered");
    }

    public void registerProvider(NotificationProvider provider) {
        providers.put(provider.getChannel(), provider);
        log.info("Registered notification provider for channel: {}", provider.getChannel());
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
            NotificationProvider provider = providers.get(notification.getChannel());
            if (provider == null) {
                throw new IllegalStateException("No provider found for channel: " + notification.getChannel());
            }

            boolean success = provider.send(notification);

            if (success) {
                notification.markSent();
                log.info("Notification {} sent via {}", notification.getId(), notification.getChannel());
                // Cancel any scheduled retry since it succeeded
                cancelScheduledRetry(notification.getId().toString());
            } else {
                notification.markFailed("Provider returned failure");
                log.warn("Notification {} failed via {}", notification.getId(), notification.getChannel());
                scheduleRetry(notification);
            }

            notificationRepository.save(notification);

        } catch (Exception e) {
            notification.markFailed(e.getMessage());
            notificationRepository.save(notification);
            scheduleRetry(notification);
            throw e;
        }
    }

    @Transactional
    public void retryFailedNotifications() {
        List<Notification> failedNotifications = notificationRepository.findRetryableNotifications(NotificationStatus.FAILED);
        
        for (Notification notification : failedNotifications) {
            if (notification.canRetry()) {
                log.info("Retrying notification {} (attempt {}/{})", 
                    notification.getId(), notification.getRetryCount() + 1, notification.getMaxRetries());
                send(notification);
            } else {
                log.warn("Notification {} exceeded max retries ({}), marking as permanently failed", 
                    notification.getId(), notification.getMaxRetries());
                notification.markFailed("Max retries exceeded");
                notificationRepository.save(notification);
            }
        }
    }

    public void scheduleRetry(Notification notification) {
        if (!notification.canRetry()) {
            return;
        }

        // Calculate exponential backoff: 1s, 2s, 4s, 8s, 16s, 30s (max)
        long delayMs = (long) (1000 * Math.pow(2, notification.getRetryCount()));
        delayMs = Math.min(delayMs, 30000); // Max 30 seconds

        String notificationId = notification.getId().toString();
        
        // Cancel any existing retry for this notification
        cancelScheduledRetry(notificationId);

        Runnable retryTask = () -> {
            log.info("Executing scheduled retry for notification {} (attempt {}/{})", 
                notificationId, notification.getRetryCount() + 1, notification.getMaxRetries());
            // Re-fetch the notification to get the latest state
            notificationRepository.findById(notification.getId()).ifPresent(n -> {
                if (n.canRetry()) {
                    send(n);
                }
            });
        };

        ScheduledFuture<?> future = taskScheduler.schedule(retryTask, Instant.now().plusMillis(delayMs));
        scheduledRetries.put(notificationId, future);
        
        log.info("Scheduled retry for notification {} in {} ms (attempt {}/{})", 
            notificationId, delayMs, notification.getRetryCount() + 1, notification.getMaxRetries());
    }

    private void cancelScheduledRetry(String notificationId) {
        ScheduledFuture<?> future = scheduledRetries.remove(notificationId);
        if (future != null && !future.isDone()) {
            future.cancel(false);
            log.debug("Cancelled scheduled retry for notification {}", notificationId);
        }
    }
}