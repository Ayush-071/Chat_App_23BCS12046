const express = require("express");
const cors = require("cors");
const path = require("path");
const helmet = require("helmet");
const cookieParser = require("cookie-parser");

const config = require("./config");
require("./db"); // connect to MongoDB

const authRouter = require("./routes/auth");
const { generalRestLimiter, authRestLimiter } = require("./rateLimiter");

const app = express();

// ----------------------------------------------------
// Security Hardening Middlewares
// ----------------------------------------------------
app.use(helmet({
    contentSecurityPolicy: false
}));

app.use(cors({
    origin: config.nodeEnv === "production" ? false : true,
    credentials: true
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

app.use(generalRestLimiter);

// ----------------------------------------------------
// Static Files & Frontend Routing
// ----------------------------------------------------
app.use(express.static(path.join(__dirname, "../client")));

app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "../client/index.html"));
});

// ----------------------------------------------------
// REST API Routes
// ----------------------------------------------------
app.use("/auth", authRestLimiter, authRouter);

// Global Error Handler
app.use((err, req, res, next) => {
    if (config.nodeEnv !== "test") {
        console.error("Express Error Handler:", err);
    }
    res.status(500).json({ error: "Internal server error" });
});

module.exports = app;
