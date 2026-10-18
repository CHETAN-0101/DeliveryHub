package com.deliveryhub.notification.domain.provider;

import com.deliveryhub.notification.config.NotificationProviderProperties;
import com.deliveryhub.notification.domain.model.Notification;
import com.deliveryhub.notification.domain.model.NotificationChannel;
import com.twilio.rest.api.v2010.account.Message;
import com.twilio.type.PhoneNumber;
import io.github.resilience4j.circuitbreaker.annotation.CircuitBreaker;
import io.github.resilience4j.retry.annotation.Retry;
import io.github.resilience4j.timelimiter.annotation.TimeLimiter;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

import java.util.concurrent.CompletableFuture;

@Component
@ConditionalOnProperty(prefix = "notification.twilio", name = "account-sid")
public class TwilioSmsProvider implements NotificationProvider {

    private static final Logger log = LoggerFactory.getLogger(TwilioSmsProvider.class);

    private final NotificationProviderProperties.Twilio properties;

    public TwilioSmsProvider(NotificationProviderProperties properties) {
        this.properties = properties.getTwilio();
    }

    @Override
    @CircuitBreaker(name = "twilio", fallbackMethod = "sendFallback")
    @Retry(name = "twilio")
    @TimeLimiter(name = "twilio")
    public boolean send(Notification notification) {
        return sendInternal(notification);
    }

    public CompletableFuture<Boolean> sendAsync(Notification notification) {
        return CompletableFuture.supplyAsync(() -> send(notification));
    }

    private boolean sendInternal(Notification notification) {
        if (properties.getAccountSid() == null || properties.getAuthToken() == null || properties.getFromNumber() == null) {
            log.warn("Twilio not configured, skipping SMS for notification {}", notification.getId());
            return false;
        }

        try {
            String toPhoneNumber = notification.getRecipientId().toString();
            
            Message message = Message.creator(
                    new PhoneNumber(toPhoneNumber),
                    new PhoneNumber(properties.getFromNumber()),
                    notification.getBody()
            ).create();

            if (message.getSid() != null) {
                log.info("SMS sent successfully via Twilio for notification {} (SID: {})", 
                    notification.getId(), message.getSid());
                return true;
            } else {
                log.error("Twilio error: Failed to send SMS for notification {}", notification.getId());
                return false;
            }
        } catch (Exception e) {
            log.error("Failed to send SMS via Twilio for notification {}", notification.getId(), e);
            throw e;
        }
    }

    private boolean sendFallback(Notification notification, Exception ex) {
        log.error("Twilio circuit breaker fallback for notification {}: {}", notification.getId(), ex.getMessage());
        return false;
    }

    @Override
    public String getChannel() {
        return NotificationChannel.SMS.name();
    }
}