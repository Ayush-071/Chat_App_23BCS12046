const mongoose = require("mongoose");

const refreshTokenSchema = new mongoose.Schema({
    token: {
        type: String,
        required: true,
        unique: true,
        index: true
    },
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true
    },
    expiresAt: {
        type: Date,
        required: true
    },
    replacedByToken: {
        type: String,
        default: null
    },
    isRevoked: {
        type: Boolean,
        default: false
    },
    createdAt: {
        type: Date,
        default: Date.now,
        expires: 30 * 24 * 60 * 60 // TTL index to auto-delete after 30 days
    }
});

// Virtual check to verify if the token is expired
refreshTokenSchema.virtual("isExpired").get(function() {
    return Date.now() >= this.expiresAt;
});

// Virtual check to verify if the token is still valid (not revoked and not expired)
refreshTokenSchema.virtual("isValid").get(function() {
    return !this.isRevoked && !this.isExpired && !this.replacedByToken;
});

module.exports = mongoose.model("RefreshToken", refreshTokenSchema);
