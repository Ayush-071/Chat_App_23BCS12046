const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema({
    from: String,
    to: String,
    message: String,
    timestamp: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model("Message", messageSchema);