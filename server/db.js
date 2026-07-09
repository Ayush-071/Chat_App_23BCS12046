const mongoose = require("mongoose");
const config = require("./config");

mongoose.connect(config.mongodbUri)
.then(() => console.log("MongoDB Connected"))
.catch(err => console.error("MongoDB Connection Error:", err));

module.exports = mongoose;