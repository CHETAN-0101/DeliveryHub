package com.deliveryhub.order.domain.repository;

import com.deliveryhub.order.domain.model.DeliveryEvent;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.UUID;

@Repository
public interface DeliveryEventRepository extends JpaRepository<DeliveryEvent, UUID> {

    Page<DeliveryEvent> findByDeliveryId(UUID deliveryId, Pageable pageable);

    List<DeliveryEvent> findByDeliveryIdOrderByCreatedAtAsc(UUID deliveryId);
}