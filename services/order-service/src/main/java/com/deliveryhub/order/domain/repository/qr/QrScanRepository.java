package com.deliveryhub.order.domain.repository.qr;

import com.deliveryhub.order.domain.model.qr.QrScan;
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
public interface QrScanRepository extends JpaRepository<QrScan, UUID> {

    Page<QrScan> findByDeliveryId(UUID deliveryId, Pageable pageable);

    List<QrScan> findByDriverIdAndScannedAtBetween(UUID driverId, Instant from, Instant to);

    @Query("SELECT COUNT(q) FROM QrScan q WHERE q.deliveryId = :deliveryId AND q.result = :result")
    long countByDeliveryIdAndResult(@Param("deliveryId") UUID deliveryId, @Param("result") QrScan.ScanResult result);

    List<QrScan> findByTokenId(UUID tokenId);

    @Query("SELECT q FROM QrScan q WHERE q.deliveryId = :deliveryId ORDER BY q.scannedAt DESC")
    List<QrScan> findByDeliveryIdOrderByScannedAtDesc(UUID deliveryId);
}