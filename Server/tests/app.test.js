const { describe, it } = require("node:test");
const assert = require("node:assert");
const { execFileSync } = require("node:child_process");
const path = require("node:path");
const request = require("supertest");

// Ensure test environment variables are set before loading app
process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-jwt-secret-key-skillbridge";
process.env.CLOUDINARY_CLOUD_NAME = "test-cloud";
process.env.CLOUDINARY_API_KEY = "test-key";
process.env.CLOUDINARY_API_SECRET = "test-secret";

const app = require("../app");
const serverDir = path.resolve(__dirname, "..");

describe("BE-01A: Baseline Express App & Test Infrastructure", () => {
    describe("Module Isolation", () => {
        it("1. Importing app.js does not call app.listen() or create a listening HTTP server", () => {
            const childScript = `
                const assert = require("node:assert");
                const http = require("node:http");
                const net = require("node:net");
                const express = require("express");

                let listenCalled = false;
                const origExpressListen = express.application.listen;
                express.application.listen = function(...args) {
                    listenCalled = true;
                    return origExpressListen.apply(this, args);
                };

                let httpListenCalled = false;
                const origHttpListen = http.Server.prototype.listen;
                http.Server.prototype.listen = function(...args) {
                    httpListenCalled = true;
                    return origHttpListen.apply(this, args);
                };

                const app = require("./app");

                assert.strictEqual(typeof app, "function", "Imported app should be an Express function");
                assert.strictEqual(listenCalled, false, "express.application.listen was unexpectedly called");
                assert.strictEqual(httpListenCalled, false, "http.Server.prototype.listen was unexpectedly called");

                const listeningHandles = process._getActiveHandles().filter(
                    h => h && (h.listening || h instanceof net.Server)
                );
                assert.strictEqual(listeningHandles.length, 0, "Active listening server handle detected");
            `;

            execFileSync(process.execPath, ["-e", childScript], {
                cwd: serverDir,
                encoding: "utf8",
                stdio: ["pipe", "pipe", "pipe"]
            });
        });

        it("2. Importing app.js does not initiate a database connection or invoke connectDB()", () => {
            const childScript = `
                const assert = require("node:assert");
                const mongoose = require("mongoose");

                let connectCalled = false;
                const origConnect = mongoose.connect;
                mongoose.connect = function(...args) {
                    connectCalled = true;
                    return origConnect.apply(this, args);
                };

                let createConnectionCalled = false;
                const origCreateConnection = mongoose.createConnection;
                mongoose.createConnection = function(...args) {
                    createConnectionCalled = true;
                    return origCreateConnection.apply(this, args);
                };

                require("./app");

                assert.strictEqual(connectCalled, false, "mongoose.connect was unexpectedly called on import");
                assert.strictEqual(createConnectionCalled, false, "mongoose.createConnection was unexpectedly called on import");
                assert.strictEqual(mongoose.connection.readyState, 0, "mongoose connection should be disconnected (state 0)");

                const dbModulePath = require.resolve("./config/db");
                assert.strictEqual(require.cache[dbModulePath], undefined, "./config/db should not be loaded on app.js import");
            `;

            execFileSync(process.execPath, ["-e", childScript], {
                cwd: serverDir,
                encoding: "utf8",
                stdio: ["pipe", "pipe", "pipe"]
            });
        });
    });

    it("3. GET / returns the existing welcome response", async () => {
        const res = await request(app).get("/");
        assert.strictEqual(res.status, 200);
        assert.strictEqual(res.text, "Welcome to SkillBridge API 🚀");
    });

    describe("4. Existing API routes are mounted and return expected unauthenticated responses", () => {
        describe("Auth routes (/api/auth)", () => {
            it("GET /api/auth/profile returns 401 when unauthenticated", async () => {
                const res = await request(app).get("/api/auth/profile");
                assert.strictEqual(res.status, 401);
                assert.deepStrictEqual(res.body, {
                    success: false,
                    message: "Access Denied. No token provided."
                });
            });

            it("PUT /api/auth/profile returns 401 when unauthenticated", async () => {
                const res = await request(app).put("/api/auth/profile").send({});
                assert.strictEqual(res.status, 401);
                assert.deepStrictEqual(res.body, {
                    success: false,
                    message: "Access Denied. No token provided."
                });
            });

            it("PUT /api/auth/upload-resume returns 401 when unauthenticated", async () => {
                const res = await request(app).put("/api/auth/upload-resume");
                assert.strictEqual(res.status, 401);
                assert.deepStrictEqual(res.body, {
                    success: false,
                    message: "Access Denied. No token provided."
                });
            });

            it("PUT /api/auth/upload-profile-picture returns 401 when unauthenticated", async () => {
                const res = await request(app).put("/api/auth/upload-profile-picture");
                assert.strictEqual(res.status, 401);
                assert.deepStrictEqual(res.body, {
                    success: false,
                    message: "Access Denied. No token provided."
                });
            });

            it("POST /api/auth/signup returns 400 validation error without body", async () => {
                const res = await request(app).post("/api/auth/signup").send({});
                assert.strictEqual(res.status, 400);
                assert.strictEqual(res.body.success, false);
                assert.ok(typeof res.body.message === "string");
            });

            it("POST /api/auth/login returns 400 validation error without body", async () => {
                const res = await request(app).post("/api/auth/login").send({});
                assert.strictEqual(res.status, 400);
                assert.strictEqual(res.body.success, false);
                assert.ok(typeof res.body.message === "string");
            });
        });

        describe("Job routes (/api/jobs)", () => {
            it("POST /api/jobs returns 401 when unauthenticated", async () => {
                const res = await request(app).post("/api/jobs").send({});
                assert.strictEqual(res.status, 401);
                assert.deepStrictEqual(res.body, {
                    success: false,
                    message: "Access Denied. No token provided."
                });
            });

            it("GET /api/jobs/recommended returns 401 when unauthenticated", async () => {
                const res = await request(app).get("/api/jobs/recommended");
                assert.strictEqual(res.status, 401);
                assert.deepStrictEqual(res.body, {
                    success: false,
                    message: "Access Denied. No token provided."
                });
            });

            it("PUT /api/jobs/:id returns 401 when unauthenticated", async () => {
                const res = await request(app).put("/api/jobs/507f1f77bcf86cd799439011").send({});
                assert.strictEqual(res.status, 401);
                assert.deepStrictEqual(res.body, {
                    success: false,
                    message: "Access Denied. No token provided."
                });
            });

            it("DELETE /api/jobs/:id returns 401 when unauthenticated", async () => {
                const res = await request(app).delete("/api/jobs/507f1f77bcf86cd799439011");
                assert.strictEqual(res.status, 401);
                assert.deepStrictEqual(res.body, {
                    success: false,
                    message: "Access Denied. No token provided."
                });
            });
        });

        describe("Application routes (/api/applications)", () => {
            it("POST /api/applications/job/:jobId returns 401 when unauthenticated", async () => {
                const res = await request(app).post("/api/applications/job/507f1f77bcf86cd799439011").send({});
                assert.strictEqual(res.status, 401);
                assert.deepStrictEqual(res.body, {
                    success: false,
                    message: "Access Denied. No token provided."
                });
            });

            it("GET /api/applications/my returns 401 when unauthenticated", async () => {
                const res = await request(app).get("/api/applications/my");
                assert.strictEqual(res.status, 401);
                assert.deepStrictEqual(res.body, {
                    success: false,
                    message: "Access Denied. No token provided."
                });
            });

            it("GET /api/applications/job/:jobId returns 401 when unauthenticated", async () => {
                const res = await request(app).get("/api/applications/job/507f1f77bcf86cd799439011");
                assert.strictEqual(res.status, 401);
                assert.deepStrictEqual(res.body, {
                    success: false,
                    message: "Access Denied. No token provided."
                });
            });

            it("PUT /api/applications/:id/status returns 401 when unauthenticated", async () => {
                const res = await request(app).put("/api/applications/507f1f77bcf86cd799439011/status").send({});
                assert.strictEqual(res.status, 401);
                assert.deepStrictEqual(res.body, {
                    success: false,
                    message: "Access Denied. No token provided."
                });
            });
        });
    });
});
