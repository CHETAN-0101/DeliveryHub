package com.deliveryhub.notification.domain.model;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

class NotificationTemplateTest {

    private final ObjectMapper objectMapper = new ObjectMapper();

    @Test
    void createTemplate_ShouldHaveCorrectFields() {
        JsonNode variables = objectMapper.createObjectNode()
                .put("customerName", "string")
                .put("deliveryId", "string");

        NotificationTemplate template = new NotificationTemplate(
                "test_template",
                "EMAIL",
                "Subject: {customerName}",
                "Body: {customerName}, {deliveryId}",
                variables
        );

        assertThat(template.getName()).isEqualTo("test_template");
        assertThat(template.getChannel()).isEqualTo("EMAIL");
        assertThat(template.getSubjectTemplate()).isEqualTo("Subject: {customerName}");
        assertThat(template.getBodyTemplate()).isEqualTo("Body: {customerName}, {deliveryId}");
        assertThat(template.getVariables()).isEqualTo(variables);
        assertThat(template.getCreatedAt()).isNotNull();
        assertThat(template.getUpdatedAt()).isNotNull();
    }

    @Test
    void renderSubject_ShouldReplaceVariables() {
        JsonNode variables = objectMapper.createObjectNode()
                .put("customerName", "John")
                .put("deliveryId", "123");

        NotificationTemplate template = new NotificationTemplate(
                "test", "EMAIL",
                "Hello {customerName}, delivery {deliveryId}",
                "Body",
                variables
        );

        String rendered = template.renderSubject(java.util.Map.of(
                "customerName", "John",
                "deliveryId", "123"
        ));

        assertThat(rendered).isEqualTo("Hello John, delivery 123");
    }

    @Test
    void renderBody_ShouldReplaceVariables() {
        JsonNode variables = objectMapper.createObjectNode()
                .put("driverName", "Mike")
                .put("vehicleType", "Motorcycle");

        NotificationTemplate template = new NotificationTemplate(
                "test", "SMS", null,
                "Driver {driverName} on {vehicleType}",
                variables
        );

        String rendered = template.renderBody(java.util.Map.of(
                "driverName", "Mike",
                "vehicleType", "Motorcycle"
        ));

        assertThat(rendered).isEqualTo("Driver Mike on Motorcycle");
    }

    @Test
    void render_WithMissingVariable_ShouldLeavePlaceholder() {
        NotificationTemplate template = new NotificationTemplate(
                "test", "EMAIL",
                "Hello {customerName}, your code is {code}",
                "Body",
                objectMapper.createObjectNode()
        );

        String rendered = template.renderSubject(java.util.Map.of(
                "customerName", "John"
                // code is missing
        ));

        assertThat(rendered).isEqualTo("Hello John, your code is {code}");
    }

    @Test
    void render_WithNullValue_ShouldReplaceWithNullString() {
        NotificationTemplate template = new NotificationTemplate(
                "test", "EMAIL",
                "Value: {optionalField}",
                "Body",
                objectMapper.createObjectNode()
        );

        String rendered = template.renderSubject(java.util.Map.of(
                "optionalField", (String) null
        ));

        assertThat(rendered).isEqualTo("Value: null");
    }

    @Test
    void templateWithSmsChannel_ShouldHaveNullSubject() {
        NotificationTemplate template = new NotificationTemplate(
                "sms_template", "SMS",
                null,
                "SMS body content",
                objectMapper.createObjectNode()
        );

        assertThat(template.getSubjectTemplate()).isNull();
        assertThat(template.getChannel()).isEqualTo("SMS");
    }

    @Test
    void templateWithPushChannel_ShouldHaveSubject() {
        NotificationTemplate template = new NotificationTemplate(
                "push_template", "PUSH",
                "Push Title",
                "Push body content",
                objectMapper.createObjectNode()
        );

        assertThat(template.getSubjectTemplate()).isEqualTo("Push Title");
        assertThat(template.getChannel()).isEqualTo("PUSH");
    }
}