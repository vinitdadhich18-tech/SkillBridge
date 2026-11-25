const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");
const User = require("../../models/User");

let mongod = null;

const connectTestDB = async () => {
    // Explicitly delete any inherited MONGO_URI so it can never be used in tests
    delete process.env.MONGO_URI;

    if (mongoose.connection.readyState !== 0) {
        throw new Error(
            `Refusing to connect test database: Mongoose already has an active connection (readyState: ${mongoose.connection.readyState}). Tests must run in strict isolation.`
        );
    }

    if (!mongod) {
        mongod = await MongoMemoryServer.create();
    }
    const uri = mongod.getUri();

    await mongoose.connect(uri);

    // Initialize User model indexes (ensuring unique index on email is built)
    await User.init();
};

const clearTestDB = async () => {
    if (mongoose.connection.readyState !== 0) {
        const collections = mongoose.connection.collections;
        for (const key of Object.keys(collections)) {
            await collections[key].deleteMany({});
        }
    }
};

const disconnectTestDB = async () => {
    if (mongoose.connection.readyState !== 0) {
        await mongoose.disconnect();
    }
    if (mongod) {
        await mongod.stop();
        mongod = null;
    }
};

module.exports = {
    connectTestDB,
    clearTestDB,
    disconnectTestDB
};
