const mongoose = require("mongoose");

module.exports = function() {
    mongoose
        .connect(process.env.MONGO_B_URL || "mongodb://localhost:27017/applewalletpns", {
            useNewUrlParser: true,
            useUnifiedTopology: true,
            dbName: "applewalletpns",
        })
        .then(() => console.log("Connected to MongoDB..."))
        .catch((error) => console.log("Could not connect to MongoDB.." + error));
};
