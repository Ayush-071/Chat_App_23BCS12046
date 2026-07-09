const express = require("express");
const http = require("http");
const cors = require("cors");
const path = require("path");
const { Server } = require("socket.io");

require("./db");
const Message = require("./models/Message");

const app = express();
app.use(cors());

// Serve frontend
app.use(express.static(path.join(__dirname, "../client")));

app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "../client/index.html"));
});

const server = http.createServer(app);

const io = new Server(server, {
    cors: { origin: "*" }
});

let users = {};           // socketId -> username
let allUsers = new Set(); // all users ever joined

io.on("connection", (socket) => {
    console.log("User connected:", socket.id);

    // =========================
    // JOIN
    // =========================
    socket.on("join", async (username) => {
        users[socket.id] = username;
        allUsers.add(username);

        try {
            const messages = await Message.find({
                $or: [
                    { from: username },
                    { to: username },
                    { to: "ALL" }
                ]
            }).sort({ timestamp: 1 });

            socket.emit("chat_history", messages);
        } catch (err) {
            console.log("Error fetching messages:", err);
        }

        // send updated user list
        io.emit("user_list", {
            online: Object.values(users),
            all: Array.from(allUsers)
        });
    });

    // =========================
    // PRIVATE MESSAGE
    // =========================
    socket.on("private_message", async ({ toUser, message }) => {
        const sender = users[socket.id];

        const payload = {
            from: sender,
            to: toUser,
            message
        };

        // save in DB
        try {
            await Message.create(payload);
        } catch (err) {
            console.log("Error saving message:", err);
        }

        // send to receiver (if online)
        for (let id in users) {
            if (users[id] === toUser) {
                io.to(id).emit("receive_message", payload);
            }
        }

        // send back to sender (important for UI update)
        socket.emit("receive_message", payload);
    });

    // =========================
    // GROUP MESSAGE
    // =========================
    socket.on("group_message", async ({ message }) => {
        const sender = users[socket.id];

        try {
            await Message.create({
                from: sender,
                to: "ALL",
                message
            });
        } catch (err) {
            console.log("Error saving group message:", err);
        }

        io.emit("receive_message", {
            from: sender + " (Group)",
            message
        });
    });

    // =========================
    // TYPING INDICATOR
    // =========================
    socket.on("typing", ({ toUser }) => {
        for (let id in users) {
            if (users[id] === toUser) {
                io.to(id).emit("typing", users[socket.id]);
            }
        }
    });

    // =========================
    // DISCONNECT
    // =========================
    socket.on("disconnect", () => {
        delete users[socket.id];

        io.emit("user_list", {
            online: Object.values(users),
            all: Array.from(allUsers)
        });
    });
});

// =========================
// START SERVER
// =========================
server.listen(5000, "0.0.0.0", () => {
    console.log("Server running on http://localhost:5000");
});