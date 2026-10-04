package com.deliveryhub.notification.domain.repository;

import com.deliveryhub.notification.domain.model.Notification;
import com.deliveryhub.notification.domain.model.NotificationStatus;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.UUID;

@Repository
public interface NotificationRepository extends JpaRepository<Notification, UUID> {

    Page<Notification> findByDeliveryId(UUID deliveryId, Pageable pageable);

    Page<Notification> findByRecipientTypeAndRecipientId(String recipientType, UUID recipientId, Pageable pageable);

    Page<Notification> findByStatus(NotificationStatus status, Pageable pageable);

    @Query("SELECT n FROM Notification n WHERE n.status = :status AND n.retryCount < n.maxRetries ORDER BY n.createdAt ASC")
    List<Notification> findRetryableNotifications(@Param("status") NotificationStatus status);

    List<Notification> findByDeliveryIdAndChannel(UUID deliveryId, String channel);
}