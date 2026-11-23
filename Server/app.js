const express = require("express");

const jobRoutes = require("./routes/jobRoutes");
const authRoutes = require("./routes/authRoutes");
const applicationRoutes = require("./routes/applicationRoutes");

const app = express();

app.use(express.json());

app.use("/api/auth", authRoutes);

app.use("/api/jobs", jobRoutes);

app.use("/api/applications", applicationRoutes);

app.get("/", (req, res) => {
    res.send("Welcome to SkillBridge API 🚀");
});

module.exports = app;
