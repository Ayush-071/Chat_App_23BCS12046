const socket = io();

let currentUser = "";
let selectedUser = "";
let privateChats = {};
let groupMessages = [];
let unreadCounts = {};
let lastMessages = {};
let currentTab = "private";
let usersCache = { all: [], online: [] };

// =========================
// JOIN
// =========================
function join() {
    currentUser = document.getElementById("username").value;
    if (!currentUser) return;

    socket.emit("join", currentUser);
}

// =========================
// RENDER USER LIST (NEW)
// =========================
function renderUserList() {
    const ul = document.getElementById("users");
    ul.innerHTML = "";

    usersCache.all.forEach(user => {
        const li = document.createElement("li");

        if (user === selectedUser) {
            li.classList.add("active");
        }

        const status = usersCache.online.includes(user) ? "🟢" : "⚫";
        const unread = unreadCounts[user] ? `🔴(${unreadCounts[user]})` : "";
        const preview = lastMessages[user] || "";

        li.innerHTML = `
            <b>${status} ${user}</b>
            <div style="font-size:11px; opacity:0.7;">${preview}</div>
            <span class="unread">${unread}</span>
        `;

        li.onclick = () => {
            selectedUser = user;
            unreadCounts[user] = 0;

            document.getElementById("toUser").value = user;

            renderUserList();   // 🔥 FIX (no backend call)
            renderMessages();
        };

        ul.appendChild(li);
    });
}

// =========================
// USER LIST
// =========================
socket.on("user_list", (data) => {
    usersCache = data;
    renderUserList();
});

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
    const msg = document.getElementById("message").value;
    if (!msg) return;

    if (currentTab === "private") {
        if (!selectedUser) return;

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
    if (currentTab === "private" && selectedUser) {
        socket.emit("typing", { toUser: selectedUser });
    }
});

// =========================
// TYPING RECEIVE
// =========================
socket.on("typing", (user) => {
    const typingDiv = document.getElementById("typing");
    if (!typingDiv) return;

    typingDiv.innerText = user + " is typing...";

    setTimeout(() => {
        typingDiv.innerText = "";
    }, 1200);
});

// =========================
// RECEIVE MESSAGE
// =========================
socket.on("receive_message", (data) => {

    const sound = document.getElementById("notifSound");
    if (sound) {
        sound.currentTime = 0;
        sound.play().catch(() => {});
    }

    // GROUP MESSAGE
    if (data.from.includes("Group")) {
        groupMessages.push(data);
        renderMessages();
        return;
    }

    // PRIVATE MESSAGE
    let otherUser =
        data.from === currentUser ? data.to : data.from;

    if (!privateChats[otherUser]) {
        privateChats[otherUser] = [];
    }

    privateChats[otherUser].push({
        from: data.from,
        message: data.message
    });

    lastMessages[otherUser] =
        (data.from === currentUser ? "You: " : "") + data.message;

    // unread
    if (otherUser !== selectedUser) {
        unreadCounts[otherUser] =
            (unreadCounts[otherUser] || 0) + 1;
    }

    renderUserList(); // 🔥 update sidebar
    renderMessages();
});

// =========================
// LOAD HISTORY
// =========================
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

            let otherUser =
                msg.from === currentUser ? msg.to : msg.from;

            if (!privateChats[otherUser]) {
                privateChats[otherUser] = [];
            }

            privateChats[otherUser].push({
                from: msg.from,
                message: msg.message
            });

            lastMessages[otherUser] =
                (msg.from === currentUser ? "You: " : "") + msg.message;
        }
    });

    if (!selectedUser) {
        const usersList = Object.keys(privateChats);
        if (usersList.length > 0) {
            selectedUser = usersList[0];
            document.getElementById("toUser").value = selectedUser;
        }
    }

    renderUserList();
    renderMessages();
});

// =========================
// RENDER MESSAGES
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
        } else {
            div.classList.add("received");
        }

        div.innerHTML = `
            <b>${msg.from}:</b> ${msg.message}
            <div style="font-size:10px; opacity:0.6;">
                ${new Date().toLocaleTimeString()}
            </div>
        `;

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