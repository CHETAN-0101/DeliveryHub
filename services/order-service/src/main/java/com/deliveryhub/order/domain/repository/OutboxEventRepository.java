package com.deliveryhub.order.domain.repository;

import com.deliveryhub.order.domain.model.OutboxEvent;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

@Repository
public interface OutboxEventRepository extends JpaRepository<OutboxEvent, UUID> {

    @Query("SELECT e FROM OutboxEvent e WHERE e.publishedAt IS NULL ORDER BY e.createdAt ASC")
    Page<OutboxEvent> findUnpublishedEvents(Pageable pageable);

    @Query("SELECT e FROM OutboxEvent e WHERE e.publishedAt IS NULL ORDER BY e.createdAt ASC")
    List<OutboxEvent> findUnpublishedEvents(@Param("batchSize") int batchSize);

    List<OutboxEvent> findByAggregateId(UUID aggregateId);

    List<OutboxEvent> findByCreatedAtBefore(Instant before);

    long countByPublishedAtIsNull();
}