package com.deliveryhub.notification.config;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

@Component
@ConfigurationProperties(prefix = "notification")
public class NotificationProviderProperties {

    private SendGrid sendgrid = new SendGrid();
    private Twilio twilio = new Twilio();
    private Firebase firebase = new Firebase();

    public SendGrid getSendgrid() {
        return sendgrid;
    }

    public void setSendgrid(SendGrid sendgrid) {
        this.sendgrid = sendgrid;
    }

    public Twilio getTwilio() {
        return twilio;
    }

    public void setTwilio(Twilio twilio) {
        this.twilio = twilio;
    }

    public Firebase getFirebase() {
        return firebase;
    }

    public void setFirebase(Firebase firebase) {
        this.firebase = firebase;
    }

    public static class SendGrid {
        private String apiKey;
        private String fromEmail;
        private String fromName;

        public String getApiKey() {
            return apiKey;
        }

        public void setApiKey(String apiKey) {
            this.apiKey = apiKey;
        }

        public String getFromEmail() {
            return fromEmail;
        }

        public void setFromEmail(String fromEmail) {
            this.fromEmail = fromEmail;
        }

        public String getFromName() {
            return fromName;
        }

        public void setFromName(String fromName) {
            this.fromName = fromName;
        }
    }

    public static class Twilio {
        private String accountSid;
        private String authToken;
        private String fromNumber;

        public String getAccountSid() {
            return accountSid;
        }

        public void setAccountSid(String accountSid) {
            this.accountSid = accountSid;
        }

        public String getAuthToken() {
            return authToken;
        }

        public void setAuthToken(String authToken) {
            this.authToken = authToken;
        }

        public String getFromNumber() {
            return fromNumber;
        }

        public void setFromNumber(String fromNumber) {
            this.fromNumber = fromNumber;
        }
    }

    public static class Firebase {
        private String projectId;
        private String credentialsPath;

        public String getProjectId() {
            return projectId;
        }

        public void setProjectId(String projectId) {
            this.projectId = projectId;
        }

        public String getCredentialsPath() {
            return credentialsPath;
        }

        public void setCredentialsPath(String credentialsPath) {
            this.credentialsPath = credentialsPath;
        }
    }
}