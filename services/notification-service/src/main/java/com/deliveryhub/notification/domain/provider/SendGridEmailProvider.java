package com.deliveryhub.notification.domain.provider;

import com.deliveryhub.notification.config.NotificationProviderProperties;
import com.deliveryhub.notification.domain.model.Notification;
import com.deliveryhub.notification.domain.model.NotificationChannel;
import com.sendgrid.Method;
import com.sendgrid.Request;
import com.sendgrid.Response;
import com.sendgrid.SendGrid;
import com.sendgrid.helpers.mail.Mail;
import com.sendgrid.helpers.mail.objects.Content;
import com.sendgrid.helpers.mail.objects.Email;
import io.github.resilience4j.circuitbreaker.annotation.CircuitBreaker;
import io.github.resilience4j.retry.annotation.Retry;
import io.github.resilience4j.timelimiter.annotation.TimeLimiter;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

import java.util.concurrent.CompletableFuture;

@Component
@ConditionalOnProperty(prefix = "notification.sendgrid", name = "api-key")
public class SendGridEmailProvider implements NotificationProvider {

    private static final Logger log = LoggerFactory.getLogger(SendGridEmailProvider.class);

    private final SendGrid sendGrid;
    private final NotificationProviderProperties.SendGrid properties;

    public SendGridEmailProvider(SendGrid sendGrid, NotificationProviderProperties properties) {
        this.sendGrid = sendGrid;
        this.properties = properties.getSendgrid();
    }

    @Override
    @CircuitBreaker(name = "sendgrid", fallbackMethod = "sendFallback")
    @Retry(name = "sendgrid")
    @TimeLimiter(name = "sendgrid")
    public boolean send(Notification notification) {
        return sendInternal(notification);
    }

    public CompletableFuture<Boolean> sendAsync(Notification notification) {
        return CompletableFuture.supplyAsync(() -> send(notification));
    }

    private boolean sendInternal(Notification notification) {
        if (sendGrid == null || properties.getApiKey() == null) {
            log.warn("SendGrid not configured, skipping email for notification {}", notification.getId());
            return false;
        }

        try {
            Email from = new Email(properties.getFromEmail(), properties.getFromName());
            Email to = new Email(notification.getRecipientId().toString());
            String subject = notification.getSubject();
            Content content = new Content("text/plain", notification.getBody());
            Mail mail = new Mail(from, subject, to, content);

            Request request = new Request();
            request.setMethod(Method.POST);
            request.setEndpoint("mail/send");
            request.setBody(mail.build());

            Response response = sendGrid.api(request);
            
            if (response.getStatusCode() >= 200 && response.getStatusCode() < 300) {
                log.info("Email sent successfully via SendGrid for notification {}", notification.getId());
                return true;
            } else {
                log.error("SendGrid error: {} - {}", response.getStatusCode(), response.getBody());
                return false;
            }
        } catch (Exception e) {
            log.error("Failed to send email via SendGrid for notification {}", notification.getId(), e);
            throw e; // Re-throw for retry/circuit breaker
        }
    }

    private boolean sendFallback(Notification notification, Exception ex) {
        log.error("SendGrid circuit breaker fallback for notification {}: {}", notification.getId(), ex.getMessage());
        return false;
    }

    @Override
    public String getChannel() {
        return NotificationChannel.EMAIL.name();
    }
}