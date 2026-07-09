const test = require("node:test");
const assert = require("node:assert");
const mongoose = require("mongoose");
const app = require("../app");
const User = require("../models/User");
const RefreshToken = require("../models/RefreshToken");

let server;
let baseUrl;

// Pre-test setup: Start server on dynamic port and clean database
test.before(async () => {
    // Wait for Mongoose to connect
    if (mongoose.connection.readyState !== 1) {
        await new Promise((resolve) => mongoose.connection.once("open", resolve));
    }
    
    // Clean up any old test users
    await User.deleteMany({ username: { $regex: /^test_user/ } });
    await RefreshToken.deleteMany({});
    
    // Start listening on a dynamic port
    await new Promise((resolve) => {
        server = app.listen(0, () => {
            const port = server.address().port;
            baseUrl = `http://127.0.0.1:${port}`;
            resolve();
        });
    });
});

// Post-test teardown: Close server and db connection
test.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await mongoose.connection.close();
});

test.describe("Authentication Rest Endpoints", () => {
    const testUsername = "test_user_alice";
    const testPassword = "supersecurepassword123";

    test("POST /auth/register - Success", async () => {
        const res = await fetch(`${baseUrl}/auth/register`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username: testUsername, password: testPassword })
        });
        
        assert.strictEqual(res.status, 201);
        const data = await res.json();
        assert.strictEqual(data.message, "Registration successful");
        
        // Verify user created in DB
        const user = await User.findOne({ username: testUsername });
        assert.ok(user);
    });

    test("POST /auth/register - Prevent Duplicates", async () => {
        const res = await fetch(`${baseUrl}/auth/register`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username: testUsername, password: "someotherpassword" })
        });
        
        assert.strictEqual(res.status, 400);
        const data = await res.json();
        assert.strictEqual(data.error, "Username is already taken");
    });

    test("POST /auth/register - Password validation", async () => {
        const res = await fetch(`${baseUrl}/auth/register`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username: "test_user_short", password: "12" })
        });
        
        assert.strictEqual(res.status, 400);
        const data = await res.json();
        assert.ok(data.error.includes("at least 6 characters"));
    });

    test("POST /auth/login - Wrong password", async () => {
        const res = await fetch(`${baseUrl}/auth/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username: testUsername, password: "incorrectpassword" })
        });
        
        assert.strictEqual(res.status, 401);
        const data = await res.json();
        assert.strictEqual(data.error, "Invalid username or password");
    });

    test("POST /auth/login - Success & Token receipt", async () => {
        const res = await fetch(`${baseUrl}/auth/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username: testUsername, password: testPassword })
        });
        
        assert.strictEqual(res.status, 200);
        const data = await res.json();
        assert.ok(data.accessToken);
        assert.strictEqual(data.user.username, testUsername);
        
        // Retrieve Cookie from headers
        const setCookies = res.headers.getSetCookie();
        let hasCookie = false;
        for (const cookie of setCookies) {
            if (cookie.includes("refreshToken=")) {
                hasCookie = true;
                break;
            }
        }
        assert.ok(hasCookie, "Should set HTTP-only refreshToken cookie");
    });

    test("POST /auth/refresh & rotation - Success", async () => {
        // Step 1: Login to get refresh token
        const loginRes = await fetch(`${baseUrl}/auth/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username: testUsername, password: testPassword })
        });
        
        const setCookies = loginRes.headers.getSetCookie();
        let cookieHeaderValue = "";
        for (const cookie of setCookies) {
            if (cookie.includes("refreshToken=")) {
                cookieHeaderValue = cookie.split(";")[0];
                break;
            }
        }
        
        // Step 2: Use refresh token to get a new access token
        const refreshRes = await fetch(`${baseUrl}/auth/refresh`, {
            method: "POST",
            headers: { "Cookie": cookieHeaderValue }
        });
        
        assert.strictEqual(refreshRes.status, 200);
        const refreshData = await refreshRes.json();
        assert.ok(refreshData.accessToken);
        
        // Verify a new refresh token cookie is set
        const nextCookies = refreshRes.headers.getSetCookie();
        let newCookieValue = "";
        for (const cookie of nextCookies) {
            if (cookie.includes("refreshToken=")) {
                newCookieValue = cookie.split(";")[0];
                break;
            }
        }
        assert.ok(newCookieValue);
        assert.notStrictEqual(newCookieValue, cookieHeaderValue, "Refresh token should rotate");
        
        // Verify rotation in DB
        const oldTokenStr = cookieHeaderValue.split("=")[1];
        const newTokenStr = newCookieValue.split("=")[1];
        
        const oldDoc = await RefreshToken.findOne({ token: oldTokenStr });
        assert.strictEqual(oldDoc.replacedByToken, newTokenStr, "Old token should list new token as replacement");
        
        // Step 3: Attempting to use the OLD rotated token again (Reuse Detection)
        const reuseRes = await fetch(`${baseUrl}/auth/refresh`, {
            method: "POST",
            headers: { "Cookie": cookieHeaderValue }
        });
        
        assert.strictEqual(reuseRes.status, 403, "Should reject rotated token reuse");
        const reuseData = await reuseRes.json();
        assert.ok(reuseData.error.includes("Compromised token detected"));
        
        // Verify all refresh tokens for the user were revoked
        const activeTokens = await RefreshToken.find({ userId: oldDoc.userId, isRevoked: false });
        assert.strictEqual(activeTokens.length, 0, "All tokens should be revoked on reuse detection");
    });
});
