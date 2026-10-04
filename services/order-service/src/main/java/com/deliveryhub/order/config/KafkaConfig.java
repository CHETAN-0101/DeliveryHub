package com.deliveryhub.order.config;

import org.apache.kafka.clients.admin.NewTopic;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.kafka.config.TopicBuilder;

@Configuration
public class KafkaConfig {

    @Bean
    public NewTopic deliveryCreatedTopic() {
        return TopicBuilder.name("delivery.created")
                .partitions(3)
                .replicas(1)
                .config("cleanup.policy", "compact")
                .config("retention.ms", "604800000") // 7 days
                .build();
    }

    @Bean
    public NewTopic deliveryDriverAssignedTopic() {
        return TopicBuilder.name("delivery.driver.assigned")
                .partitions(3)
                .replicas(1)
                .config("cleanup.policy", "compact")
                .config("retention.ms", "604800000")
                .build();
    }

    @Bean
    public NewTopic deliveryPickedUpTopic() {
        return TopicBuilder.name("delivery.picked_up")
                .partitions(3)
                .replicas(1)
                .config("cleanup.policy", "compact")
                .config("retention.ms", "604800000")
                .build();
    }

    @Bean
    public NewTopic deliveryStartedTopic() {
        return TopicBuilder.name("delivery.started")
                .partitions(3)
                .replicas(1)
                .config("cleanup.policy", "compact")
                .config("retention.ms", "604800000")
                .build();
    }

    @Bean
    public NewTopic deliveryCompletedTopic() {
        return TopicBuilder.name("delivery.completed")
                .partitions(3)
                .replicas(1)
                .config("cleanup.policy", "compact")
                .config("retention.ms", "604800000")
                .build();
    }

    @Bean
    public NewTopic deliveryCancelledTopic() {
        return TopicBuilder.name("delivery.cancelled")
                .partitions(3)
                .replicas(1)
                .config("cleanup.policy", "compact")
                .config("retention.ms", "604800000")
                .build();
    }

    @Bean
    public NewTopic deliveryDlqTopic() {
        return TopicBuilder.name("delivery.dlq")
                .partitions(1)
                .replicas(1)
                .config("cleanup.policy", "compact")
                .config("retention.ms", "2592000000") // 30 days
                .build();
    }
}