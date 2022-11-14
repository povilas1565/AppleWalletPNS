const express = require("express");
const error = require("../middleware/error");
const subscriptions = require("../routes/subscriptions");

module.exports = function(app) {
    app.use(express.json({limit: "100mb"}));
    app.use(express.urlencoded({limit: "100mb", extended: true}));
    app.use("/api", subscriptions);
    app.use(error);
};
