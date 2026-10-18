package com.deliveryhub.notification.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.TaskScheduler;
import org.springframework.scheduling.concurrent.ThreadPoolTaskScheduler;

@Configuration
public class RetrySchedulerConfig {

    @Bean
    public TaskScheduler notificationRetryScheduler() {
        ThreadPoolTaskScheduler scheduler = new ThreadPoolTaskScheduler();
        scheduler.setPoolSize(5);
        scheduler.setThreadNamePrefix("notification-retry-");
        scheduler.setDaemon(true);
        scheduler.initialize();
        return scheduler;
    }
}