const express = require("express");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const User = require("../models/User");
const RefreshToken = require("../models/RefreshToken");
const config = require("../config");
const { registerSchema, loginSchema } = require("../schemas");

const router = express.Router();

const ACCESS_TOKEN_EXPIRY = "15m";
const REFRESH_TOKEN_COOKIE_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 days

// Cookie options helper
const getCookieOptions = () => {
    return {
        httpOnly: true,
        secure: config.nodeEnv === "production",
        sameSite: "strict",
        maxAge: REFRESH_TOKEN_COOKIE_MAX_AGE
    };
};

// Helper to generate access token
const generateAccessToken = (user) => {
    return jwt.sign(
        { userId: user._id, username: user.username },
        config.jwtAccessSecret,
        { expiresIn: ACCESS_TOKEN_EXPIRY }
    );
};

// Helper to generate a new refresh token and save to DB
const generateAndSaveRefreshToken = async (user) => {
    const tokenString = crypto.randomBytes(40).toString("hex");
    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_COOKIE_MAX_AGE);
    
    const refreshToken = new RefreshToken({
        token: tokenString,
        userId: user._id,
        expiresAt
    });
    
    await refreshToken.save();
    return tokenString;
};

// ----------------------------------------------------
// REGISTER
// ----------------------------------------------------
router.post("/register", async (req, res, next) => {
    try {
        const validated = registerSchema.parse(req.body);
        
        // Check if user already exists
        const existingUser = await User.findOne({ username: validated.username });
        if (existingUser) {
            return res.status(400).json({ error: "Username is already taken" });
        }
        
        const user = new User({
            username: validated.username,
            password: validated.password
        });
        
        await user.save();
        res.status(201).json({ message: "Registration successful" });
    } catch (err) {
        if (err.name === "ZodError") {
            const msg = err.errors?.[0]?.message || err.issues?.[0]?.message || "Validation failed";
            return res.status(400).json({ error: msg });
        }
        next(err);
    }
});

// ----------------------------------------------------
// LOGIN
// ----------------------------------------------------
router.post("/login", async (req, res, next) => {
    try {
        const validated = loginSchema.parse(req.body);
        
        const user = await User.findOne({ username: validated.username });
        if (!user || !(await user.comparePassword(validated.password))) {
            return res.status(401).json({ error: "Invalid username or password" });
        }
        
        const accessToken = generateAccessToken(user);
        const refreshToken = await generateAndSaveRefreshToken(user);
        
        res.cookie("refreshToken", refreshToken, getCookieOptions());
        res.json({
            message: "Login successful",
            accessToken,
            user: { username: user.username }
        });
    } catch (err) {
        if (err.name === "ZodError") {
            const msg = err.errors?.[0]?.message || err.issues?.[0]?.message || "Validation failed";
            return res.status(400).json({ error: msg });
        }
        next(err);
    }
});

// ----------------------------------------------------
// REFRESH TOKEN (Rotation)
// ----------------------------------------------------
router.post("/refresh", async (req, res, next) => {
    const { refreshToken: tokenString } = req.cookies;
    if (!tokenString) {
        return res.status(401).json({ error: "Authentication token required" });
    }
    
    try {
        const refreshTokenDoc = await RefreshToken.findOne({ token: tokenString });
        
        if (!refreshTokenDoc) {
            return res.status(401).json({ error: "Invalid refresh token" });
        }
        
        // Reuse detection: if token is revoked or already replaced
        if (refreshTokenDoc.isRevoked || refreshTokenDoc.replacedByToken) {
            // Revoke all tokens belonging to this user (security compromise measure)
            await RefreshToken.updateMany({ userId: refreshTokenDoc.userId }, { isRevoked: true });
            res.clearCookie("refreshToken", getCookieOptions());
            return res.status(403).json({ error: "Compromised token detected. All sessions revoked. Please log in again." });
        }
        
        // Check if token is expired
        if (refreshTokenDoc.isExpired) {
            refreshTokenDoc.isRevoked = true;
            await refreshTokenDoc.save();
            res.clearCookie("refreshToken", getCookieOptions());
            return res.status(401).json({ error: "Session expired. Please log in again." });
        }
        
        const user = await User.findById(refreshTokenDoc.userId);
        if (!user) {
            return res.status(401).json({ error: "User not found" });
        }
        
        // Generate new tokens
        const newAccessToken = generateAccessToken(user);
        const newRefreshTokenString = await generateAndSaveRefreshToken(user);
        
        // Link old token to the replacement
        refreshTokenDoc.replacedByToken = newRefreshTokenString;
        await refreshTokenDoc.save();
        
        res.cookie("refreshToken", newRefreshTokenString, getCookieOptions());
        res.json({
            accessToken: newAccessToken
        });
    } catch (err) {
        next(err);
    }
});

// ----------------------------------------------------
// LOGOUT
// ----------------------------------------------------
router.post("/logout", async (req, res, next) => {
    const { refreshToken: tokenString } = req.cookies;
    if (!tokenString) {
        return res.status(204).end(); // No content to logout
    }
    
    try {
        const refreshTokenDoc = await RefreshToken.findOne({ token: tokenString });
        if (refreshTokenDoc) {
            refreshTokenDoc.isRevoked = true;
            await refreshTokenDoc.save();
        }
        
        res.clearCookie("refreshToken", getCookieOptions());
        res.status(204).end();
    } catch (err) {
        next(err);
    }
});

module.exports = router;
