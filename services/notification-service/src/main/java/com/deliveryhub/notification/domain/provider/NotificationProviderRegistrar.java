package com.deliveryhub.notification.domain.provider;

import com.deliveryhub.notification.domain.service.NotificationSender;
import jakarta.annotation.PostConstruct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

import java.util.Comparator;
import java.util.List;

@Component
public class NotificationProviderRegistrar {

    private static final Logger log = LoggerFactory.getLogger(NotificationProviderRegistrar.class);

    private final NotificationSender notificationSender;
    private final List<NotificationProvider> providers;

    public NotificationProviderRegistrar(NotificationSender notificationSender,
                                          List<NotificationProvider> providers) {
        this.notificationSender = notificationSender;
        this.providers = providers;
    }

    @PostConstruct
    public void registerProviders() {
        // Sort providers: real providers first (non-Mock), then mock providers
        // This ensures real providers take precedence via putIfAbsent in NotificationSender
        providers.stream()
            .sorted(Comparator.comparing(p -> p.getClass().getSimpleName().startsWith("Mock") ? 1 : 0))
            .forEach(provider -> {
                notificationSender.registerProvider(provider);
                log.debug("Registered notification provider: {} for channel {}", 
                    provider.getClass().getSimpleName(), provider.getChannel());
            });
        log.info("All notification providers registered: {}", providers.size());
    }
}