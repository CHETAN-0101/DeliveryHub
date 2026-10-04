package ratelimit

import (
	"context"
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/go-redis/redis/v8"
	"github.com/gin-gonic/gin"
)

type RateLimiter struct {
	client *redis.Client
	rps    int
	burst  int
}

func NewRateLimiter(client *redis.Client, rps, burst int) *RateLimiter {
	return &RateLimiter{
		client: client,
		rps:    rps,
		burst:  burst,
	}
}

func (rl *RateLimiter) Middleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		// Use user ID if available, otherwise IP
		userID, exists := c.Get("user_id")
		var key string
		if exists {
			key = "ratelimit:user:" + userID.(string)
		} else {
			key = "ratelimit:ip:" + c.ClientIP()
		}

		allowed, retryAfter, err := rl.allow(c.Request.Context(), key)
		if err != nil {
			// On Redis error, allow request (fail open)
			c.Next()
			return
		}

		if !allowed {
			c.Header("X-RateLimit-Limit", strconv.Itoa(rl.rps))
			c.Header("X-RateLimit-Remaining", "0")
			c.Header("Retry-After", strconv.Itoa(int(retryAfter.Seconds())))
			c.AbortWithStatusJSON(429, gin.H{
				"error":       "rate limit exceeded",
				"retryAfter":  retryAfter.String(),
			})
			return
		}

		// Add rate limit headers
		remaining := rl.burst - 1 // simplified
		if remaining < 0 {
			remaining = 0
		}
		c.Header("X-RateLimit-Limit", strconv.Itoa(rl.rps))
		c.Header("X-RateLimit-Remaining", strconv.Itoa(remaining))

		c.Next()
	}
}

func (rl *RateLimiter) allow(ctx context.Context, key string) (bool, time.Duration, error) {
	now := time.Now().Unix()
	windowStart := now - 1 // 1 second window

	// Use sorted set for sliding window
	pipe := rl.client.Pipeline()
	pipe.ZRemRangeByScore(ctx, key, "0", strconv.FormatInt(windowStart, 10))
	pipe.ZCard(ctx, key)
	pipe.ZAdd(ctx, key, &redis.Z{Score: float64(now), Member: fmt.Sprintf("%d-%s", now, key)})
	pipe.Expire(ctx, key, 2*time.Second)
	
	results, err := pipe.Exec(ctx)
	if err != nil {
		return false, 0, err
	}

	count := results[1].(*redis.IntCmd).Val()
	if int(count) >= rl.rps {
		// Get oldest entry to calculate retry-after
		oldest, err := rl.client.ZRange(ctx, key, 0, 0).Result()
		if err != nil || len(oldest) == 0 {
			return false, time.Second, nil
		}
		
		// Parse timestamp from member
		parts := strings.Split(oldest[0], "-")
		if len(parts) < 1 {
			return false, time.Second, nil
		}
		
		oldestTime, _ := strconv.ParseInt(parts[0], 10, 64)
		retryAfter := time.Duration(oldestTime+1-now) * time.Second
		if retryAfter < 0 {
			retryAfter = time.Second
		}
		
		return false, retryAfter, nil
	}

	return true, 0, nil
}