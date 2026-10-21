package com.deliveryhub.order.domain.service.qr;

import com.deliveryhub.order.domain.model.Delivery;
import com.deliveryhub.order.domain.model.qr.QrScan;
import com.deliveryhub.order.domain.model.qr.QrToken;
import com.deliveryhub.order.domain.repository.DeliveryRepository;
import com.deliveryhub.order.domain.repository.qr.QrScanRepository;
import com.deliveryhub.order.domain.repository.qr.QrTokenRepository;
import com.deliveryhub.order.dto.QrScanResponse;
import com.deliveryhub.order.dto.QrTokenResponse;
import com.deliveryhub.order.exception.ResourceNotFoundException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

@Service
@Transactional
public class QrService {

    private static final Logger log = LoggerFactory.getLogger(QrService.class);
    private static final SecureRandom SECURE_RANDOM = new SecureRandom();
    private static final int TOKEN_BYTES = 32; // 256-bit entropy

    private final QrTokenRepository tokenRepository;
    private final QrScanRepository scanRepository;
    private final DeliveryRepository deliveryRepository;

    public QrService(QrTokenRepository tokenRepository,
                     QrScanRepository scanRepository,
                     DeliveryRepository deliveryRepository) {
        this.tokenRepository = tokenRepository;
        this.scanRepository = scanRepository;
        this.deliveryRepository = deliveryRepository;
    }

    public QrTokenResponse generateToken(UUID deliveryId, UUID requesterId, Duration ttl, boolean isDispatcher) {
        Delivery delivery = deliveryRepository.findById(deliveryId)
                .orElseThrow(() -> new ResourceNotFoundException("Delivery not found: " + deliveryId));

        if (!isDispatcher && !delivery.getCustomerId().equals(requesterId)) {
            throw new org.springframework.security.access.AccessDeniedException("Not delivery owner");
        }

        // Revoke existing active token for this delivery
        tokenRepository.findByDeliveryIdAndRevokedAtIsNull(deliveryId)
                .ifPresent(QrToken::revoke);

        // Generate cryptographically random token (256-bit = 32 bytes = 64 hex chars)
        byte[] randomBytes = new byte[TOKEN_BYTES];
        SECURE_RANDOM.nextBytes(randomBytes);
        StringBuilder rawToken = new StringBuilder(TOKEN_BYTES * 2);
        for (byte b : randomBytes) {
            rawToken.append(String.format("%02x", b));
        }
        String tokenString = rawToken.toString();
        String tokenHash = QrToken.sha256Hex(tokenString);

        QrToken token = QrToken.create(deliveryId, tokenString, requesterId, ttl);
        tokenRepository.save(token);

        log.info("Generated QR token for delivery {} by {} (dispatcher={})", deliveryId, requesterId, isDispatcher);
        return new QrTokenResponse(token.getId(), tokenString, token.getExpiresAt());
    }

    public QrScanResponse scan(UUID deliveryId, String rawToken, UUID driverId, QrScan.ScanAction action, Map<String, Object> metadata) {
        String tokenHash = QrToken.sha256Hex(rawToken);
        Optional<QrToken> tokenOpt = tokenRepository.findByTokenHash(tokenHash);

        QrToken token = tokenOpt.orElse(null);
        QrScan.ScanResult result;

        if (token == null) {
            result = QrScan.ScanResult.INVALID_TOKEN;
        } else if (!token.getDeliveryId().equals(deliveryId)) {
            result = QrScan.ScanResult.WRONG_DELIVERY;
        } else if (!token.isValid()) {
            result = token.getRevokedAt() != null ? QrScan.ScanResult.REVOKED : QrScan.ScanResult.EXPIRED;
        } else if (driverId != null && !deliveryRepository.existsByIdAndDriverId(deliveryId, driverId)) {
            result = QrScan.ScanResult.UNAUTHORIZED;
        } else {
            result = QrScan.ScanResult.SUCCESS;
        }

        UUID tokenId = (token != null) ? token.getId() : UUID.randomUUID(); // Use random UUID for invalid token scans
        QrScan scan = QrScan.create(deliveryId, tokenId, driverId, action, result, metadata);
        scanRepository.save(scan);

        log.info("QR scan for delivery {}: action={}, result={}, driverId={}", deliveryId, action, result, driverId);
        return new QrScanResponse(scan.getId(), scan.getDeliveryId(), scan.getAction(), scan.getResult(), scan.getScannedAt());
    }

    @Transactional(readOnly = true)
    public Page<QrScanResponse> getScanHistory(UUID deliveryId, Pageable pageable) {
        return scanRepository.findByDeliveryId(deliveryId, pageable)
                .map(scan -> new QrScanResponse(
                        scan.getId(),
                        scan.getDeliveryId(),
                        scan.getAction(),
                        scan.getResult(),
                        scan.getScannedAt()
                ));
    }

    @Transactional(readOnly = true)
    public Optional<QrToken> getActiveToken(UUID deliveryId) {
        return tokenRepository.findByDeliveryIdAndRevokedAtIsNull(deliveryId);
    }

    public void cleanupExpiredTokens() {
        tokenRepository.deleteExpired(Instant.now());
    }
}