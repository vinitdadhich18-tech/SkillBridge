// Set test-only environment variables before importing app or models
process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-jwt-secret-key-skillbridge";
process.env.CLOUDINARY_CLOUD_NAME = "test-cloud";
process.env.CLOUDINARY_API_KEY = "test-key";
process.env.CLOUDINARY_API_SECRET = "test-secret";
delete process.env.MONGO_URI;

const { describe, it, before, after, beforeEach } = require("node:test");
const assert = require("node:assert");
const request = require("supertest");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");

const app = require("../app");
const User = require("../models/User");
const { connectTestDB, clearTestDB, disconnectTestDB } = require("./helpers/db");

describe("BE-01B1: Authentication Integration Tests", () => {
    before(async () => {
        await connectTestDB();
    });

    after(async () => {
        await disconnectTestDB();
    });

    beforeEach(async () => {
        await clearTestDB();
    });

    // ==========================================
    // A. SIGNUP TESTS
    // ==========================================
    describe("A. Signup (/api/auth/signup)", () => {
        const validSignupPayload = {
            name: "John Doe",
            email: "john.doe@example.com",
            password: "password123"
        };

        it("1. Successful signup returns HTTP 201 with public user data and JWT token", async () => {
            const res = await request(app)
                .post("/api/auth/signup")
                .send(validSignupPayload);

            assert.strictEqual(res.status, 201);
            assert.strictEqual(res.body.success, true);
            assert.strictEqual(res.body.message, "User created successfully!");

            // Verify JWT token
            assert.strictEqual(typeof res.body.token, "string");
            const decoded = jwt.verify(res.body.token, process.env.JWT_SECRET);
            assert.ok(decoded.id);

            // Verify public user fields
            assert.ok(res.body.user);
            assert.ok(res.body.user.id);
            assert.strictEqual(res.body.user.name, validSignupPayload.name);
            assert.strictEqual(res.body.user.email, validSignupPayload.email);

            // Verify password or hash is never exposed in response
            assert.strictEqual(res.body.user.password, undefined);
            assert.strictEqual(res.body.password, undefined);
        });

        it("2. Password is saved as a secure bcrypt hash in the database", async () => {
            await request(app)
                .post("/api/auth/signup")
                .send(validSignupPayload);

            const dbUser = await User.findOne({ email: validSignupPayload.email });
            assert.ok(dbUser, "User should be persisted in database");

            // Stored password must not equal plain-text password
            assert.notStrictEqual(dbUser.password, validSignupPayload.password);

            // bcrypt.compare must verify the stored hash matches original password
            const isMatch = await bcrypt.compare(validSignupPayload.password, dbUser.password);
            assert.strictEqual(isMatch, true);
        });

        it("3. Newly created user receives the default 'student' role from the schema", async () => {
            await request(app)
                .post("/api/auth/signup")
                .send(validSignupPayload);

            const dbUser = await User.findOne({ email: validSignupPayload.email });
            assert.ok(dbUser);
            assert.strictEqual(dbUser.role, "student");
        });

        it("4. Invalid signup data returns HTTP 400 validation error", async () => {
            // Missing name
            const res1 = await request(app)
                .post("/api/auth/signup")
                .send({
                    email: "test@example.com",
                    password: "password123"
                });
            assert.strictEqual(res1.status, 400);
            assert.strictEqual(res1.body.success, false);
            assert.ok(typeof res1.body.message === "string");

            // Short name (< 3 chars)
            const res2 = await request(app)
                .post("/api/auth/signup")
                .send({
                    name: "Jo",
                    email: "test@example.com",
                    password: "password123"
                });
            assert.strictEqual(res2.status, 400);
            assert.strictEqual(res2.body.success, false);

            // Invalid email format
            const res3 = await request(app)
                .post("/api/auth/signup")
                .send({
                    name: "Valid Name",
                    email: "not-an-email",
                    password: "password123"
                });
            assert.strictEqual(res3.status, 400);
            assert.strictEqual(res3.body.success, false);

            // Short password (< 8 chars)
            const res4 = await request(app)
                .post("/api/auth/signup")
                .send({
                    name: "Valid Name",
                    email: "valid@example.com",
                    password: "short"
                });
            assert.strictEqual(res4.status, 400);
            assert.strictEqual(res4.body.success, false);
        });

        it("5. Duplicate email registration returns HTTP 409 and does not duplicate account", async () => {
            // First registration
            const res1 = await request(app)
                .post("/api/auth/signup")
                .send(validSignupPayload);
            assert.strictEqual(res1.status, 201);

            // Second registration with the same email
            const res2 = await request(app)
                .post("/api/auth/signup")
                .send({
                    name: "Another Name",
                    email: validSignupPayload.email,
                    password: "anotherPassword123"
                });

            assert.strictEqual(res2.status, 409);
            assert.strictEqual(res2.body.success, false);
            assert.strictEqual(res2.body.message, "Email already registered");

            // Confirm only one account exists in database
            const userCount = await User.countDocuments({ email: validSignupPayload.email });
            assert.strictEqual(userCount, 1);
        });
    });

    // ==========================================
    // B. LOGIN TESTS
    // ==========================================
    describe("B. Login (/api/auth/login)", () => {
        const userCredentials = {
            name: "Alice Smith",
            email: "alice@example.com",
            password: "securePassword123"
        };

        beforeEach(async () => {
            await request(app)
                .post("/api/auth/signup")
                .send(userCredentials);
        });

        it("1. Successful login returns HTTP 200 with JWT and public user info without password", async () => {
            const res = await request(app)
                .post("/api/auth/login")
                .send({
                    email: userCredentials.email,
                    password: userCredentials.password
                });

            assert.strictEqual(res.status, 200);
            assert.strictEqual(res.body.success, true);
            assert.strictEqual(res.body.message, "Login Successful");

            // Verify JWT
            assert.strictEqual(typeof res.body.token, "string");
            const decoded = jwt.verify(res.body.token, process.env.JWT_SECRET);
            assert.ok(decoded.id);

            // Verify public user info
            assert.ok(res.body.user);
            assert.ok(res.body.user.id);
            assert.strictEqual(res.body.user.name, userCredentials.name);
            assert.strictEqual(res.body.user.email, userCredentials.email);

            // Verify password or hash is never exposed
            assert.strictEqual(res.body.user.password, undefined);
            assert.strictEqual(res.body.password, undefined);
        });

        it("2. Incorrect password returns HTTP 401 Invalid Credentials", async () => {
            const res = await request(app)
                .post("/api/auth/login")
                .send({
                    email: userCredentials.email,
                    password: "wrongPassword456"
                });

            assert.strictEqual(res.status, 401);
            assert.strictEqual(res.body.success, false);
            assert.strictEqual(res.body.message, "Invalid Credentials");
        });

        it("3. Nonexistent user returns HTTP 404 User not found", async () => {
            const res = await request(app)
                .post("/api/auth/login")
                .send({
                    email: "nonexistent@example.com",
                    password: "password123"
                });

            // Currently implemented behavior: 404 on unknown email
            assert.strictEqual(res.status, 404);
            assert.strictEqual(res.body.success, false);
            assert.strictEqual(res.body.message, "User not found");
        });

        it("4. Invalid login request returns HTTP 400 validation error", async () => {
            // Missing password
            const res1 = await request(app)
                .post("/api/auth/login")
                .send({ email: userCredentials.email });
            assert.strictEqual(res1.status, 400);
            assert.strictEqual(res1.body.success, false);

            // Invalid email format
            const res2 = await request(app)
                .post("/api/auth/login")
                .send({
                    email: "not-an-email",
                    password: "password123"
                });
            assert.strictEqual(res2.status, 400);
            assert.strictEqual(res2.body.success, false);

            // Short password (< 8 chars)
            const res3 = await request(app)
                .post("/api/auth/login")
                .send({
                    email: userCredentials.email,
                    password: "short"
                });
            assert.strictEqual(res3.status, 400);
            assert.strictEqual(res3.body.success, false);
        });
    });

    // ==========================================
    // C. GET PROFILE TESTS
    // ==========================================
    describe("C. Get Profile (/api/auth/profile)", () => {
        let authToken;
        let userId;
        const profileUser = {
            name: "Bob Johnson",
            email: "bob@example.com",
            password: "bobPassword123"
        };

        beforeEach(async () => {
            const signupRes = await request(app)
                .post("/api/auth/signup")
                .send(profileUser);
            authToken = signupRes.body.token;
            userId = signupRes.body.user.id;
        });

        it("1. Successful profile retrieval with valid JWT returns HTTP 200 without password", async () => {
            const res = await request(app)
                .get("/api/auth/profile")
                .set("Authorization", `Bearer ${authToken}`);

            assert.strictEqual(res.status, 200);
            assert.strictEqual(res.body.success, true);
            assert.strictEqual(res.body.message, "Profile fetched successfully");

            // Verify user profile details
            assert.ok(res.body.user);
            assert.strictEqual(res.body.user._id.toString(), userId);
            assert.strictEqual(res.body.user.name, profileUser.name);
            assert.strictEqual(res.body.user.email, profileUser.email);
            assert.strictEqual(res.body.user.role, "student");

            // Verify password is fully excluded
            assert.strictEqual(res.body.user.password, undefined);
        });

        it("2. Missing or invalid authentication returns HTTP 401", async () => {
            // Missing token
            const resNoToken = await request(app).get("/api/auth/profile");
            assert.strictEqual(resNoToken.status, 401);
            assert.strictEqual(resNoToken.body.success, false);
            assert.strictEqual(resNoToken.body.message, "Access Denied. No token provided.");

            // Invalid token
            const resInvalidToken = await request(app)
                .get("/api/auth/profile")
                .set("Authorization", "Bearer invalid.jwt.token");
            assert.strictEqual(resInvalidToken.status, 401);
            assert.strictEqual(resInvalidToken.body.success, false);
            assert.strictEqual(resInvalidToken.body.message, "Invalid or Expired Token");
        });

        it("3. User not found returns HTTP 404 when valid JWT contains nonexistent ID", async () => {
            const nonExistentId = new mongoose.Types.ObjectId();
            const tokenWithNonExistentUser = jwt.sign(
                { id: nonExistentId },
                process.env.JWT_SECRET,
                { expiresIn: "7d" }
            );

            const res = await request(app)
                .get("/api/auth/profile")
                .set("Authorization", `Bearer ${tokenWithNonExistentUser}`);

            assert.strictEqual(res.status, 404);
            assert.strictEqual(res.body.success, false);
            assert.strictEqual(res.body.message, "User not found");
        });
    });

    // ==========================================
    // D. UPDATE PROFILE TESTS
    // ==========================================
    describe("D. Update Profile (/api/auth/profile)", () => {
        let authToken;
        let userId;
        const initialUser = {
            name: "Carol White",
            email: "carol@example.com",
            password: "carolPassword123"
        };

        beforeEach(async () => {
            const signupRes = await request(app)
                .post("/api/auth/signup")
                .send(initialUser);
            authToken = signupRes.body.token;
            userId = signupRes.body.user.id;
        });

        it("1. Successful profile update returns HTTP 200 and persists supported fields in database", async () => {
            const updatePayload = {
                bio: "Aspiring Full-Stack Software Engineer",
                college: "Tech University",
                branch: "Computer Science",
                graduationYear: 2026,
                github: "https://github.com/carolwhite",
                linkedin: "https://linkedin.com/in/carolwhite",
                portfolio: "https://carolwhite.dev",
                skills: ["JavaScript", "TypeScript", "Node.js", "Express", "MongoDB"]
            };

            const res = await request(app)
                .put("/api/auth/profile")
                .set("Authorization", `Bearer ${authToken}`)
                .send(updatePayload);

            assert.strictEqual(res.status, 200);
            assert.strictEqual(res.body.success, true);
            assert.strictEqual(res.body.message, "Profile updated successfully");

            // Verify returned response contains updated values
            assert.ok(res.body.user);
            assert.strictEqual(res.body.user.bio, updatePayload.bio);
            assert.strictEqual(res.body.user.college, updatePayload.college);
            assert.strictEqual(res.body.user.branch, updatePayload.branch);
            assert.strictEqual(res.body.user.graduationYear, updatePayload.graduationYear);
            assert.strictEqual(res.body.user.github, updatePayload.github);
            assert.strictEqual(res.body.user.linkedin, updatePayload.linkedin);
            assert.strictEqual(res.body.user.portfolio, updatePayload.portfolio);
            assert.deepStrictEqual(res.body.user.skills, updatePayload.skills);

            // Verify persistence in actual database
            const dbUser = await User.findById(userId);
            assert.strictEqual(dbUser.bio, updatePayload.bio);
            assert.strictEqual(dbUser.college, updatePayload.college);
            assert.strictEqual(dbUser.graduationYear, updatePayload.graduationYear);
            assert.deepStrictEqual(dbUser.skills, updatePayload.skills);
        });

        it("2. Password cannot be modified through the profile update endpoint", async () => {
            const originalDbUser = await User.findById(userId);
            const originalPasswordHash = originalDbUser.password;

            const res = await request(app)
                .put("/api/auth/profile")
                .set("Authorization", `Bearer ${authToken}`)
                .send({
                    bio: "Updated bio",
                    password: "newAttemptedPassword999"
                });

            assert.strictEqual(res.status, 200);

            // Verify the stored password hash in the database is completely unchanged
            const reloadedDbUser = await User.findById(userId);
            assert.strictEqual(reloadedDbUser.password, originalPasswordHash);

            // Verify the new attempted password does not match
            const matchesAttempted = await bcrypt.compare("newAttemptedPassword999", reloadedDbUser.password);
            assert.strictEqual(matchesAttempted, false);
        });

        it("3. User role cannot be changed through the profile update endpoint", async () => {
            const res = await request(app)
                .put("/api/auth/profile")
                .set("Authorization", `Bearer ${authToken}`)
                .send({
                    bio: "Trying to escalate to recruiter",
                    role: "recruiter"
                });

            assert.strictEqual(res.status, 200);

            // Verify role in response remains 'student'
            assert.strictEqual(res.body.user.role, "student");

            // Verify role in database remains 'student'
            const dbUser = await User.findById(userId);
            assert.strictEqual(dbUser.role, "student");
        });

        it("4. Missing authentication returns HTTP 401", async () => {
            const res = await request(app)
                .put("/api/auth/profile")
                .send({ bio: "Unauthorized bio update" });

            assert.strictEqual(res.status, 401);
            assert.strictEqual(res.body.success, false);
            assert.strictEqual(res.body.message, "Access Denied. No token provided.");
        });

        it("5. Nonexistent user returns HTTP 200 with user: null (KNOWN ISSUE: BE-05)", async () => {
            const nonExistentId = new mongoose.Types.ObjectId();
            const tokenWithNonExistentUser = jwt.sign(
                { id: nonExistentId },
                process.env.JWT_SECRET,
                { expiresIn: "7d" }
            );

            const res = await request(app)
                .put("/api/auth/profile")
                .set("Authorization", `Bearer ${tokenWithNonExistentUser}`)
                .send({ bio: "Ghost user update" });

            // KNOWN ISSUE: BE-05
            // User.findByIdAndUpdate returns null when user is missing, but authController.updateProfile
            // returns HTTP 200 with { success: true, message: "Profile updated successfully", user: null }
            // instead of returning an HTTP 404 User not found.
            assert.strictEqual(res.status, 200);
            assert.strictEqual(res.body.success, true);
            assert.strictEqual(res.body.user, null);
        });
    });
});
