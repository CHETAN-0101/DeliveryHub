package com.deliveryhub.notification.config;

import org.apache.kafka.clients.admin.NewTopic;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.kafka.config.TopicBuilder;

@Configuration
public class KafkaConfig {

    @Bean
    public NewTopic driverAssignedTopic() {
        return TopicBuilder.name("delivery.driver.assigned")
                .partitions(3)
                .replicas(1)
                .config("cleanup.policy", "compact")
                .build();
    }

    @Bean
    public NewTopic pickedUpTopic() {
        return TopicBuilder.name("delivery.picked_up")
                .partitions(3)
                .replicas(1)
                .config("cleanup.policy", "compact")
                .build();
    }

    @Bean
    public NewTopic startedTopic() {
        return TopicBuilder.name("delivery.started")
                .partitions(3)
                .replicas(1)
                .config("cleanup.policy", "compact")
                .build();
    }

    @Bean
    public NewTopic completedTopic() {
        return TopicBuilder.name("delivery.completed")
                .partitions(3)
                .replicas(1)
                .config("cleanup.policy", "compact")
                .build();
    }

    @Bean
    public NewTopic cancelledTopic() {
        return TopicBuilder.name("delivery.cancelled")
                .partitions(3)
                .replicas(1)
                .config("cleanup.policy", "compact")
                .build();
    }

    @Bean
    public NewTopic notificationDlqTopic() {
        return TopicBuilder.name("notification.dlq")
                .partitions(1)
                .replicas(1)
                .config("cleanup.policy", "compact")
                .build();
    }
}