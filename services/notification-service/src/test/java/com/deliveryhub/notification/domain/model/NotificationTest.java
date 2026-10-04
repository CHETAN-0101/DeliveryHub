package com.deliveryhub.notification.domain.model;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

class NotificationTest {

    @Test
    void createNotification_ShouldHaveCorrectInitialState() {
        UUID deliveryId = UUID.randomUUID();
        UUID recipientId = UUID.randomUUID();

        Notification notification = new Notification(
                deliveryId,
                "CUSTOMER",
                recipientId,
                NotificationChannel.EMAIL,
                "Test Subject",
                "Test Body",
                "test_template",
                "{}",
                3
        );

        assertThat(notification.getDeliveryId()).isEqualTo(deliveryId);
        assertThat(notification.getRecipientType()).isEqualTo("CUSTOMER");
        assertThat(notification.getRecipientId()).isEqualTo(recipientId);
        assertThat(notification.getChannel()).isEqualTo(NotificationChannel.EMAIL);
        assertThat(notification.getSubject()).isEqualTo("Test Subject");
        assertThat(notification.getBody()).isEqualTo("Test Body");
        assertThat(notification.getTemplateName()).isEqualTo("test_template");
        assertThat(notification.getTemplateData()).isEqualTo("{}");
        assertThat(notification.getStatus()).isEqualTo(NotificationStatus.PENDING);
        assertThat(notification.getRetryCount()).isEqualTo(0);
        assertThat(notification.getMaxRetries()).isEqualTo(3);
        assertThat(notification.getErrorMessage()).isNull();
        assertThat(notification.getSentAt()).isNull();
        assertThat(notification.getCreatedAt()).isNotNull();
        assertThat(notification.getUpdatedAt()).isNotNull();
    }

    @Test
    void markSent_ShouldUpdateStatusAndTimestamp() {
        Notification notification = createTestNotification();

        notification.markSent();

        assertThat(notification.getStatus()).isEqualTo(NotificationStatus.SENT);
        assertThat(notification.getSentAt()).isNotNull();
        assertThat(notification.getErrorMessage()).isNull();
    }

    @Test
    void markFailed_ShouldUpdateStatusAndErrorMessage() {
        Notification notification = createTestNotification();
        String errorMessage = "SMTP connection timeout";

        notification.markFailed(errorMessage);

        assertThat(notification.getStatus()).isEqualTo(NotificationStatus.FAILED);
        assertThat(notification.getErrorMessage()).isEqualTo(errorMessage);
        assertThat(notification.getRetryCount()).isEqualTo(1);
    }

    @Test
    void incrementRetry_ShouldIncreaseRetryCount() {
        Notification notification = createTestNotification();

        notification.incrementRetry();

        assertThat(notification.getRetryCount()).isEqualTo(1);
        assertThat(notification.getStatus()).isEqualTo(NotificationStatus.PENDING);
    }

    @Test
    void canRetry_WhenRetryCountLessThanMax_ShouldReturnTrue() {
        Notification notification = createTestNotification();
        notification.incrementRetry(); // retryCount = 1, maxRetries = 3

        assertThat(notification.canRetry()).isTrue();
    }

    @Test
    void canRetry_WhenRetryCountEqualsMax_ShouldReturnFalse() {
        Notification notification = createTestNotification();
        notification.incrementRetry(); // 1
        notification.incrementRetry(); // 2
        notification.incrementRetry(); // 3 = maxRetries

        assertThat(notification.canRetry()).isFalse();
    }

    @Test
    void canRetry_WhenAlreadySent_ShouldReturnFalse() {
        Notification notification = createTestNotification();
        notification.markSent();

        assertThat(notification.canRetry()).isFalse();
    }

    @ParameterizedTest
    @EnumSource(NotificationChannel.class)
    void createNotification_WithDifferentChannels_ShouldSetChannelCorrectly(NotificationChannel channel) {
        Notification notification = new Notification(
                UUID.randomUUID(), "CUSTOMER", UUID.randomUUID(),
                channel, "Subject", "Body", "template", "{}", 3
        );

        assertThat(notification.getChannel()).isEqualTo(channel);
    }

    @ParameterizedTest
    @EnumSource(NotificationStatus.class)
    void notificationStatus_ShouldHaveExpectedValues(NotificationStatus status) {
        assertThat(status).isNotNull();
    }

    private Notification createTestNotification() {
        return new Notification(
                UUID.randomUUID(), "CUSTOMER", UUID.randomUUID(),
                NotificationChannel.EMAIL, "Subject", "Body", "template", "{}", 3
        );
    }
}