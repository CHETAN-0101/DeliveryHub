package com.deliveryhub.notification.controller;

import com.deliveryhub.notification.domain.model.Notification;
import com.deliveryhub.notification.domain.model.NotificationChannel;
import com.deliveryhub.notification.domain.model.NotificationStatus;
import com.deliveryhub.notification.domain.repository.NotificationRepository;
import com.deliveryhub.notification.dto.NotificationResponse;
import com.deliveryhub.notification.dto.PageResponse;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.http.MediaType;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.web.servlet.MockMvc;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(NotificationController.class)
@WithMockUser(roles = "CUSTOMER")
class NotificationControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockBean
    private NotificationRepository notificationRepository;

    private UUID notificationId;
    private UUID deliveryId;
    private Notification testNotification;

    @BeforeEach
    void setUp() {
        notificationId = UUID.randomUUID();
        deliveryId = UUID.randomUUID();

        testNotification = new Notification(
                deliveryId,
                "CUSTOMER",
                UUID.randomUUID(),
                NotificationChannel.EMAIL,
                "Test Subject",
                "Test Body Content",
                "test_template",
                "{}",
                3
        );
        // Use reflection to set the ID since it's generated
        // In real tests, we'd use a builder or setter
    }

    @Test
    void getNotification_WhenExists_ShouldReturnNotification() throws Exception {
        // Arrange
        when(notificationRepository.findById(notificationId))
                .thenReturn(java.util.Optional.of(testNotification));

        // Act & Assert
        mockMvc.perform(get("/api/v1/notifications/{id}", notificationId)
                        .accept(MediaType.APPLICATION_JSON))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(notificationId.toString()))
                .andExpect(jsonPath("$.deliveryId").value(deliveryId.toString()))
                .andExpect(jsonPath("$.channel").value("EMAIL"))
                .andExpect(jsonPath("$.subject").value("Test Subject"))
                .andExpect(jsonPath("$.status").value("PENDING"));

        verify(notificationRepository).findById(notificationId);
    }

    @Test
    void getNotification_WhenNotFound_ShouldReturn404() throws Exception {
        // Arrange
        when(notificationRepository.findById(notificationId))
                .thenReturn(java.util.Optional.empty());

        // Act & Assert
        mockMvc.perform(get("/api/v1/notifications/{id}", notificationId)
                        .accept(MediaType.APPLICATION_JSON))
                .andExpect(status().isNotFound());
    }

    @Test
    void listNotifications_WithoutFilters_ShouldReturnPagedResults() throws Exception {
        // Arrange
        Page<Notification> page = new PageImpl<>(List.of(testNotification), PageRequest.of(0, 20), 1);
        when(notificationRepository.findAll(any(Pageable.class)))
                .thenReturn(page);

        // Act & Assert
        mockMvc.perform(get("/api/v1/notifications")
                        .accept(MediaType.APPLICATION_JSON))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content").isArray())
                .andExpect(jsonPath("$.content[0].id").value(notificationId.toString()))
                .andExpect(jsonPath("$.totalElements").value(1))
                .andExpect(jsonPath("$.totalPages").value(1));

        verify(notificationRepository).findAll(any(Pageable.class));
    }

    @Test
    void listNotifications_WithDeliveryIdFilter_ShouldReturnFilteredResults() throws Exception {
        // Arrange
        Page<Notification> page = new PageImpl<>(List.of(testNotification), PageRequest.of(0, 20), 1);
        when(notificationRepository.findByDeliveryId(eq(deliveryId), any(Pageable.class)))
                .thenReturn(page);

        // Act & Assert
        mockMvc.perform(get("/api/v1/notifications")
                        .param("deliveryId", deliveryId.toString())
                        .accept(MediaType.APPLICATION_JSON))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(1));

        verify(notificationRepository).findByDeliveryId(eq(deliveryId), any(Pageable.class));
    }

    @Test
    void listNotifications_WithStatusFilter_ShouldReturnFilteredResults() throws Exception {
        // Arrange
        Page<Notification> page = new PageImpl<>(List.of(testNotification), PageRequest.of(0, 20), 1);
        when(notificationRepository.findByStatus(eq(NotificationStatus.PENDING), any(Pageable.class)))
                .thenReturn(page);

        // Act & Assert
        mockMvc.perform(get("/api/v1/notifications")
                        .param("status", "PENDING")
                        .accept(MediaType.APPLICATION_JSON))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(1));

        verify(notificationRepository).findByStatus(eq(NotificationStatus.PENDING), any(Pageable.class));
    }

    @Test
    void listNotifications_WithPagination_ShouldRespectPageSize() throws Exception {
        // Arrange
        Page<Notification> page = new PageImpl<>(List.of(testNotification), PageRequest.of(1, 10), 25);
        when(notificationRepository.findAll(any(Pageable.class)))
                .thenReturn(page);

        // Act & Assert
        mockMvc.perform(get("/api/v1/notifications")
                        .param("page", "1")
                        .param("size", "10")
                        .accept(MediaType.APPLICATION_JSON))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.pageNumber").value(1))
                .andExpect(jsonPath("$.pageSize").value(10))
                .andExpect(jsonPath("$.totalElements").value(25));
    }
}