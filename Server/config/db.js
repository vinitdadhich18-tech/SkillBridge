const mongoose = require("mongoose");

const connectDB = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);

        console.log("✅ MongoDB Connected Successfully");
    } catch (error) {
        console.log("❌ MongoDB Connection Failed");

        console.log("Error Name:", error.name);
        console.log("Error Message:", error.message);

        process.exit(1);
    }
};

module.exports = connectDB;