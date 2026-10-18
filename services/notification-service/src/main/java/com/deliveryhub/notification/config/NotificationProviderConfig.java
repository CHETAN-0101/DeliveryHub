package com.deliveryhub.notification.config;

import com.google.auth.oauth2.GoogleCredentials;
import com.google.firebase.FirebaseApp;
import com.google.firebase.FirebaseOptions;
import com.google.firebase.messaging.FirebaseMessaging;
import com.sendgrid.SendGrid;
import com.twilio.Twilio;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import jakarta.annotation.PostConstruct;
import java.io.FileInputStream;
import java.io.IOException;

@Configuration
public class NotificationProviderConfig {

    private static final Logger log = LoggerFactory.getLogger(NotificationProviderConfig.class);

    private final NotificationProviderProperties properties;

    @Autowired
    public NotificationProviderConfig(NotificationProviderProperties properties) {
        this.properties = properties;
    }

    @PostConstruct
    public void init() {
        if (properties.getTwilio().getAccountSid() != null && properties.getTwilio().getAuthToken() != null) {
            Twilio.init(properties.getTwilio().getAccountSid(), properties.getTwilio().getAuthToken());
            log.info("Twilio initialized");
        } else {
            log.warn("Twilio credentials not configured");
        }

        if (properties.getFirebase().getProjectId() != null && properties.getFirebase().getCredentialsPath() != null) {
            try {
                FileInputStream serviceAccount = new FileInputStream(properties.getFirebase().getCredentialsPath());
                FirebaseOptions options = FirebaseOptions.builder()
                        .setCredentials(GoogleCredentials.fromStream(serviceAccount))
                        .setProjectId(properties.getFirebase().getProjectId())
                        .build();
                if (FirebaseApp.getApps().isEmpty()) {
                    FirebaseApp.initializeApp(options);
                }
                log.info("Firebase initialized for project: {}", properties.getFirebase().getProjectId());
            } catch (IOException e) {
                log.error("Failed to initialize Firebase: {}", e.getMessage());
            }
        } else {
            log.warn("Firebase credentials not configured");
        }
    }

    @Bean
    @ConditionalOnProperty(prefix = "notification.sendgrid", name = "api-key")
    public SendGrid sendGrid() {
        return new SendGrid(properties.getSendgrid().getApiKey());
    }

    @Bean
    @ConditionalOnProperty(prefix = "notification.firebase", name = "project-id")
    public FirebaseMessaging firebaseMessaging() {
        return FirebaseMessaging.getInstance();
    }
}