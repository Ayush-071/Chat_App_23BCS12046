let socket = null;
let accessToken = "";
let currentUser = "";
let selectedUser = "";
let privateChats = {};
let groupMessages = [];
let unreadCounts = {};
let lastMessages = {};
let currentTab = "private";
let usersCache = { all: [], online: [] };

// =========================
// ONLOAD CHECK SESSION
// =========================
window.addEventListener("load", async () => {
    // Attempt silent refresh on page load
    const success = await refreshSession();
    if (success) {
        showChatInterface();
    } else {
        showAuthInterface();
    }
});

// Refresh token interval checks (every 10 minutes)
setInterval(async () => {
    if (accessToken) {
        await refreshSession();
    }
}, 10 * 60 * 1000);

// =========================
// AUTHENTICATION FUNCTIONS
// =========================
async function register() {
    const usernameInput = document.getElementById("username").value.trim();
    const passwordInput = document.getElementById("password").value;
    const statusDiv = document.getElementById("auth-status");
    
    if (!usernameInput || !passwordInput) {
        statusDiv.textContent = "Please fill in all fields.";
        return;
    }

    try {
        const response = await fetch("/auth/register", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username: usernameInput, password: passwordInput })
        });
        
        const data = await response.json();
        if (response.ok) {
            statusDiv.style.color = "#00e676";
            statusDiv.textContent = "Registration successful! Please login.";
            document.getElementById("password").value = "";
        } else {
            statusDiv.style.color = "#ff6b6b";
            statusDiv.textContent = data.error || "Registration failed.";
        }
    } catch (err) {
        console.error(err);
        statusDiv.textContent = "Server error. Try again.";
    }
}

async function login() {
    const usernameInput = document.getElementById("username").value.trim();
    const passwordInput = document.getElementById("password").value;
    const statusDiv = document.getElementById("auth-status");

    if (!usernameInput || !passwordInput) {
        statusDiv.textContent = "Please fill in all fields.";
        return;
    }

    try {
        const response = await fetch("/auth/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username: usernameInput, password: passwordInput })
        });
        
        const data = await response.json();
        if (response.ok) {
            accessToken = data.accessToken;
            currentUser = data.user.username;
            
            showChatInterface();
        } else {
            statusDiv.style.color = "#ff6b6b";
            statusDiv.textContent = data.error || "Login failed.";
        }
    } catch (err) {
        console.error(err);
        statusDiv.textContent = "Server error. Try again.";
    }
}

async function refreshSession() {
    try {
        const response = await fetch("/auth/refresh", {
            method: "POST"
        });
        
        if (response.ok) {
            const data = await response.json();
            accessToken = data.accessToken;
            
            // Extract username from token payload (JWT decoding)
            const base64Url = accessToken.split('.')[1];
            const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
            const payload = JSON.parse(window.atob(base64));
            currentUser = payload.username;
            return true;
        }
    } catch (err) {
        console.error("Token refresh failed:", err);
    }
    return false;
}

async function logout() {
    try {
        await fetch("/auth/logout", { method: "POST" });
    } catch (err) {
        console.error("Logout error:", err);
    }
    
    accessToken = "";
    currentUser = "";
    selectedUser = "";
    privateChats = {};
    groupMessages = [];
    unreadCounts = {};
    lastMessages = {};
    
    if (socket) {
        socket.disconnect();
        socket = null;
    }
    
    showAuthInterface();
}

function showAuthInterface() {
    document.getElementById("auth-view").style.display = "block";
    document.getElementById("session-view").style.display = "none";
    document.getElementById("username").value = "";
    document.getElementById("password").value = "";
    document.getElementById("auth-status").textContent = "";
}

function showChatInterface() {
    document.getElementById("auth-view").style.display = "none";
    document.getElementById("session-view").style.display = "block";
    document.getElementById("display-username").textContent = currentUser;
    
    initSocketConnection();
}

// =========================
// SOCKET CONNECTION
// =========================
function initSocketConnection() {
    if (socket) {
        socket.disconnect();
    }
    
    socket = io({
        auth: {
            token: accessToken
        }
    });

    socket.on("connect", () => {
        console.log("Connected to server via WebSocket");
        socket.emit("join");
    });
    
    socket.on("user_list", (data) => {
        usersCache = data;
        renderUserList();
    });

    socket.on("typing", (user) => {
        const typingDiv = document.getElementById("typing");
        if (!typingDiv) return;
        typingDiv.textContent = user + " is typing...";
        
        if (socket.typingTimeout) clearTimeout(socket.typingTimeout);
        socket.typingTimeout = setTimeout(() => {
            typingDiv.textContent = "";
        }, 1200);
    });

    socket.on("receive_message", (data) => {
        const sound = document.getElementById("notifSound");
        if (sound) {
            sound.currentTime = 0;
            sound.play().catch(() => {});
        }

        // GROUP MESSAGE
        if (data.from.endsWith(" (Group)")) {
            groupMessages.push(data);
            renderMessages();
            return;
        }

        // PRIVATE MESSAGE
        let otherUser = data.from === currentUser ? data.to : data.from;

        if (!privateChats[otherUser]) {
            privateChats[otherUser] = [];
        }

        privateChats[otherUser].push({
            from: data.from,
            message: data.message
        });

        lastMessages[otherUser] = (data.from === currentUser ? "You: " : "") + data.message;

        // update unread counts
        if (otherUser !== selectedUser) {
            unreadCounts[otherUser] = (unreadCounts[otherUser] || 0) + 1;
        }

        renderUserList();
        renderMessages();
    });

    socket.on("chat_history", (messages) => {
        privateChats = {};
        groupMessages = [];
        lastMessages = {};

        messages.forEach(msg => {
            if (msg.to === "ALL") {
                groupMessages.push({
                    from: msg.from + " (Group)",
                    message: msg.message
                });
            } else {
                let otherUser = msg.from === currentUser ? msg.to : msg.from;

                if (!privateChats[otherUser]) {
                    privateChats[otherUser] = [];
                }

                privateChats[otherUser].push({
                    from: msg.from,
                    message: msg.message
                });

                lastMessages[otherUser] = (msg.from === currentUser ? "You: " : "") + msg.message;
            }
        });

        if (!selectedUser) {
            const usersList = Object.keys(privateChats).filter(u => u !== currentUser);
            if (usersList.length > 0) {
                selectedUser = usersList[0];
                document.getElementById("toUser").value = selectedUser;
            }
        }

        renderUserList();
        renderMessages();
    });

    socket.on("error_message", (msg) => {
        alert(msg);
    });

    socket.on("connect_error", async (err) => {
        console.error("Socket authentication error:", err.message);
        // Attempt silent token refresh
        const refreshed = await refreshSession();
        if (refreshed && socket) {
            socket.auth.token = accessToken;
            socket.connect();
        } else {
            logout();
        }
    });
}

// =========================
// RENDER USER LIST (Sanitized)
// =========================
function renderUserList() {
    const ul = document.getElementById("users");
    ul.innerHTML = "";

    usersCache.all.forEach(user => {
        // Don't show ourselves in the messaging contact list
        if (user === currentUser) return;

        const li = document.createElement("li");
        if (user === selectedUser) {
            li.classList.add("active");
        }

        const status = usersCache.online.includes(user) ? "🟢" : "⚫";
        const unread = unreadCounts[user] ? ` 🔴(${unreadCounts[user]})` : "";
        const preview = lastMessages[user] || "";

        // Secure DOM injection using textContent to prevent XSS
        const statusSpan = document.createElement("b");
        statusSpan.textContent = `${status} ${user}${unread}`;
        li.appendChild(statusSpan);

        const previewDiv = document.createElement("div");
        previewDiv.style.fontSize = "11px";
        previewDiv.style.opacity = "0.7";
        previewDiv.textContent = preview;
        li.appendChild(previewDiv);

        li.onclick = () => {
            selectedUser = user;
            unreadCounts[user] = 0;
            document.getElementById("toUser").value = user;

            renderUserList();
            renderMessages();
        };

        ul.appendChild(li);
    });
}

// =========================
// SWITCH TAB
// =========================
function switchTab(tab) {
    currentTab = tab;

    document.getElementById("privateTab").classList.remove("active");
    document.getElementById("groupTab").classList.remove("active");
    document.getElementById(tab + "Tab").classList.add("active");

    renderMessages();
}

// =========================
// SEND MESSAGE
// =========================
function send() {
    if (!socket) return;
    
    const msg = document.getElementById("message").value;
    if (!msg) return;

    if (currentTab === "private") {
        if (!selectedUser) {
            alert("Please select a user from the sidebar to chat privately.");
            return;
        }

        socket.emit("private_message", {
            toUser: selectedUser,
            message: msg
        });

        lastMessages[selectedUser] = "You: " + msg;
    } else {
        socket.emit("group_message", { message: msg });
    }

    document.getElementById("message").value = "";
}

// =========================
// TYPING SEND
// =========================
document.getElementById("message").addEventListener("input", () => {
    if (socket && currentTab === "private" && selectedUser) {
        socket.emit("typing", { toUser: selectedUser });
    }
});

// =========================
// RENDER MESSAGES (Sanitized)
// =========================
function renderMessages() {
    const msgDiv = document.getElementById("messages");
    msgDiv.innerHTML = "";

    let list = [];

    if (currentTab === "private") {
        if (!selectedUser) return;
        list = privateChats[selectedUser] || [];
    } else {
        list = groupMessages;
    }

    list.forEach(msg => {
        const div = document.createElement("div");
        div.classList.add("message");

        if (msg.from === currentUser) {
            div.classList.add("sent");
        } else if (msg.from.startsWith(currentUser) && msg.from.endsWith(" (Group)")) {
            div.classList.add("sent");
        } else {
            div.classList.add("received");
        }

        // Secure DOM injection using textContent to prevent XSS
        const sender = document.createElement("b");
        sender.textContent = `${msg.from}: `;
        div.appendChild(sender);

        const text = document.createElement("span");
        text.textContent = msg.message;
        div.appendChild(text);

        const time = document.createElement("div");
        time.style.fontSize = "10px";
        time.style.opacity = "0.6";
        time.style.marginTop = "3px";
        time.textContent = new Date().toLocaleTimeString();
        div.appendChild(time);

        msgDiv.appendChild(div);
    });

    msgDiv.scrollTop = msgDiv.scrollHeight;
}

// =========================
// DARK MODE
// =========================
function toggleMode() {
    document.body.classList.toggle("light");
}