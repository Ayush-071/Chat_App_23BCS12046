const http = require("http");
const app = require("./app");
const config = require("./config");
const initSocket = require("./socket");

const server = http.createServer(app);

// Initialize Socket.IO logic
initSocket(server);

server.listen(config.port, "0.0.0.0", () => {
    console.log(`Server running in ${config.nodeEnv} mode on http://localhost:${config.port}`);
});