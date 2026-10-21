package com.deliveryhub.order.domain.repository.qr;

import com.deliveryhub.order.domain.model.qr.QrToken;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface QrTokenRepository extends JpaRepository<QrToken, UUID> {

    Optional<QrToken> findByTokenHash(String tokenHash);

    Optional<QrToken> findByDeliveryIdAndRevokedAtIsNull(UUID deliveryId);

    List<QrToken> findByDeliveryIdOrderByCreatedAtDesc(UUID deliveryId);

    @Modifying
    @Query("DELETE FROM QrToken q WHERE q.expiresAt IS NOT NULL AND q.expiresAt < :now")
    void deleteExpired(@Param("now") Instant now);

    Page<QrToken> findByCreatedBy(UUID createdBy, Pageable pageable);
}