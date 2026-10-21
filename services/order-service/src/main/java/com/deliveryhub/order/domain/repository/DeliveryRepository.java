package com.deliveryhub.order.domain.repository;

import com.deliveryhub.order.domain.model.Delivery;
import com.deliveryhub.order.domain.model.DeliveryStatus;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface DeliveryRepository extends JpaRepository<Delivery, UUID> {

    Page<Delivery> findByCustomerId(UUID customerId, Pageable pageable);

    Page<Delivery> findByStatus(DeliveryStatus status, Pageable pageable);

    Page<Delivery> findByCustomerIdAndStatus(UUID customerId, DeliveryStatus status, Pageable pageable);

    List<Delivery> findByStatusIn(List<DeliveryStatus> statuses);

    List<Delivery> findByDriverIdAndStatusIn(UUID driverId, List<DeliveryStatus> statuses);

    @Query("SELECT d FROM Delivery d WHERE d.status IN :statuses ORDER BY d.createdAt ASC")
    List<Delivery> findAssignableDeliveries(@Param("statuses") List<DeliveryStatus> statuses);

    Optional<Delivery> findByIdAndCustomerId(UUID id, UUID customerId);

    boolean existsById(UUID id);

    boolean existsByIdAndDriverId(UUID id, UUID driverId);

    long countByStatus(DeliveryStatus status);
}