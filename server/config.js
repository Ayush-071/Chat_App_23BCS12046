const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });

const requiredEnv = [
    "MONGODB_URI",
    "JWT_ACCESS_SECRET",
    "JWT_REFRESH_SECRET",
    "PORT",
    "NODE_ENV"
];

const missingEnv = requiredEnv.filter(env => !process.env[env]);

if (missingEnv.length > 0) {
    throw new Error(`CRITICAL CONFIG ERROR: Missing environment variables: ${missingEnv.join(", ")}`);
}

module.exports = {
    mongodbUri: process.env.MONGODB_URI,
    jwtAccessSecret: process.env.JWT_ACCESS_SECRET,
    jwtRefreshSecret: process.env.JWT_REFRESH_SECRET,
    port: parseInt(process.env.PORT, 10) || 5000,
    nodeEnv: process.env.NODE_ENV
};
