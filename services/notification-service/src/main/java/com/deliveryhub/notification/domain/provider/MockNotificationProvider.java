package com.deliveryhub.notification.domain.provider;

import com.deliveryhub.notification.domain.model.Notification;
import com.deliveryhub.notification.domain.model.NotificationChannel;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.util.Random;

@Component
public class MockNotificationProvider implements NotificationProvider {

    private static final Logger log = LoggerFactory.getLogger(MockNotificationProvider.class);
    private final Random random = new Random();

    private final String channel;
    private final double successRate;

    public MockNotificationProvider(NotificationChannel channel) {
        this.channel = channel.name();
        this.successRate = 0.95; // 95% success rate
    }

    @Override
    public boolean send(Notification notification) {
        // Simulate network delay
        try {
            Thread.sleep(50 + random.nextInt(100));
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }

        boolean success = random.nextDouble() < successRate;
        
        if (success) {
            log.info("Mock {} notification sent for {}", channel, notification.getId());
        } else {
            log.warn("Mock {} notification failed for {}", channel, notification.getId());
        }
        
        return success;
    }

    @Override
    public String getChannel() {
        return channel;
    }
}