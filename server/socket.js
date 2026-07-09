const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");
const config = require("./config");
const Message = require("./models/Message");
const { privateMessageSchema, groupMessageSchema, typingSchema } = require("./schemas");
const { limitSocketEvent, clearSocketBucket } = require("./rateLimiter");

let users = {};           // socketId -> username
let allUsers = new Set(); // all users ever joined

function initSocket(server) {
    const io = new Server(server, {
        cors: {
            origin: config.nodeEnv === "production" ? false : "*", // disable wildcard in production
            methods: ["GET", "POST"]
        }
    });

    // ----------------------------------------------------
    // Authentication Middleware
    // ----------------------------------------------------
    io.use((socket, next) => {
        const token = socket.handshake.auth?.token;
        if (!token) {
            return next(new Error("Authentication error: Token missing"));
        }

        try {
            const decoded = jwt.verify(token, config.jwtAccessSecret);
            // Attach user details to socket session
            socket.user = {
                userId: decoded.userId,
                username: decoded.username
            };
            next();
        } catch (err) {
            return next(new Error("Authentication error: Invalid or expired token"));
        }
    });

    // ----------------------------------------------------
    // Connection Handler
    // ----------------------------------------------------
    io.on("connection", (socket) => {
        console.log(`User authenticated and connected: ${socket.user.username} (${socket.id})`);

        // =========================
        // JOIN
        // =========================
        // Prevent impersonation: ignore client-passed username argument and use socket.user.username
        socket.on("join", async () => {
            const username = socket.user.username;
            users[socket.id] = username;
            allUsers.add(username);

            try {
                // Fetch chat history for user or public group
                const messages = await Message.find({
                    $or: [
                        { from: username },
                        { to: username },
                        { to: "ALL" }
                    ]
                }).sort({ timestamp: 1 });

                socket.emit("chat_history", messages);
            } catch (err) {
                console.error("Error fetching messages:", err);
                socket.emit("error_message", "Failed to load chat history");
            }

            // Send updated user lists
            io.emit("user_list", {
                online: Object.values(users),
                all: Array.from(allUsers)
            });
        });

        // =========================
        // PRIVATE MESSAGE
        // =========================
        socket.on("private_message", async (payload) => {
            // Rate Limiting
            if (!limitSocketEvent(socket.id)) {
                return socket.emit("error_message", "Rate limit exceeded. Please slow down.");
            }

            // Payload Validation
            try {
                const validated = privateMessageSchema.parse(payload);
                const sender = socket.user.username;

                const dbMessage = {
                    from: sender,
                    to: validated.toUser,
                    message: validated.message
                };

                // Save in DB
                await Message.create(dbMessage);

                // Send to receiver if online
                let receiverOnline = false;
                for (let id in users) {
                    if (users[id] === validated.toUser) {
                        io.to(id).emit("receive_message", dbMessage);
                        receiverOnline = true;
                    }
                }

                // Send back to sender
                socket.emit("receive_message", dbMessage);
            } catch (err) {
                if (err.name === "ZodError") {
                    return socket.emit("error_message", `Invalid data: ${err.errors[0].message}`);
                }
                console.error("Error saving/sending private message:", err);
                socket.emit("error_message", "Failed to process private message");
            }
        });

        // =========================
        // GROUP MESSAGE
        // =========================
        socket.on("group_message", async (payload) => {
            // Rate Limiting
            if (!limitSocketEvent(socket.id)) {
                return socket.emit("error_message", "Rate limit exceeded. Please slow down.");
            }

            // Payload Validation
            try {
                const validated = groupMessageSchema.parse(payload);
                const sender = socket.user.username;

                await Message.create({
                    from: sender,
                    to: "ALL",
                    message: validated.message
                });

                io.emit("receive_message", {
                    from: sender + " (Group)",
                    message: validated.message
                });
            } catch (err) {
                if (err.name === "ZodError") {
                    return socket.emit("error_message", `Invalid data: ${err.errors[0].message}`);
                }
                console.error("Error saving/sending group message:", err);
                socket.emit("error_message", "Failed to process group message");
            }
        });

        // =========================
        // TYPING INDICATOR
        // =========================
        socket.on("typing", (payload) => {
            // Rate Limiting
            if (!limitSocketEvent(socket.id, 15, 5)) { // higher limits for typing events
                return;
            }

            // Payload Validation
            try {
                const validated = typingSchema.parse(payload);
                const sender = socket.user.username;

                for (let id in users) {
                    if (users[id] === validated.toUser) {
                        io.to(id).emit("typing", sender);
                    }
                }
            } catch (err) {
                // Ignore validation errors silently for transient typing events
            }
        });

        // =========================
        // DISCONNECT
        // =========================
        socket.on("disconnect", () => {
            console.log(`User disconnected: ${socket.user.username} (${socket.id})`);
            
            // Clean up rate limiting token bucket
            clearSocketBucket(socket.id);
            
            delete users[socket.id];

            io.emit("user_list", {
                online: Object.values(users),
                all: Array.from(allUsers)
            });
        });
    });

    return io;
}

module.exports = initSocket;
