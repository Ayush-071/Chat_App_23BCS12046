const rateLimit = require("express-rate-limit");

// General REST API rate limiter
const generalRestLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per window
    standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders: false, // Disable the `X-RateLimit-*` headers
    message: { error: "Too many requests from this IP, please try again later." }
});

// Stricter rate limiter for auth (register/login/refresh)
const authRestLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 15, // Limit each IP to 15 login/register/refresh requests per window
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many authentication requests, please try again later." }
});

// Custom Token Bucket rate limiter class for Socket.IO connections
class TokenBucket {
    constructor(maxTokens = 10, refillRatePerSec = 2) {
        this.maxTokens = maxTokens;
        this.refillRate = refillRatePerSec;
        this.tokens = maxTokens;
        this.lastRefill = Date.now();
    }

    consume(tokensNeeded = 1) {
        const now = Date.now();
        const elapsedSecs = (now - this.lastRefill) / 1000;
        
        // Add refilled tokens
        this.tokens = Math.min(this.maxTokens, this.tokens + elapsedSecs * this.refillRate);
        this.lastRefill = now;

        if (this.tokens >= tokensNeeded) {
            this.tokens -= tokensNeeded;
            return true;
        }
        return false;
    }
}

// In-memory socket bucket cache
const socketBuckets = new Map();

// Helper to check and consume tokens for a socket connection
function limitSocketEvent(socketId, maxTokens = 8, refillRatePerSec = 2) {
    if (!socketBuckets.has(socketId)) {
        socketBuckets.set(socketId, new TokenBucket(maxTokens, refillRatePerSec));
    }
    const bucket = socketBuckets.get(socketId);
    return bucket.consume(1);
}

// Clean up socket bucket cache when socket disconnects to prevent memory leaks
function clearSocketBucket(socketId) {
    socketBuckets.delete(socketId);
}

module.exports = {
    generalRestLimiter,
    authRestLimiter,
    limitSocketEvent,
    clearSocketBucket
};
