const express = require("express");
const dotenv = require("dotenv");
const connectDB = require("./config/db");

dotenv.config();

connectDB();

const app = express();

app.use(express.json());

const authRoutes = require("./routes/authRoutes");

app.use("/api/auth", authRoutes);

const PORT = process.env.PORT || 3000;

app.get("/", (req, res) => {
    res.send("Welcome to SkillBridge API 🚀");
});


app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});