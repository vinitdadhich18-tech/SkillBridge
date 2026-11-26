// Set test-only environment variables before importing app or models
process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-jwt-secret-key-skillbridge";
process.env.CLOUDINARY_CLOUD_NAME = "test-cloud";
process.env.CLOUDINARY_API_KEY = "test-key";
process.env.CLOUDINARY_API_SECRET = "test-secret";
delete process.env.MONGO_URI;

const { describe, it, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");

const app = require("../app");
const User = require("../models/User");
const Job = require("../models/Job");
const { connectTestDB, clearTestDB, disconnectTestDB } = require("./helpers/db");

describe("BE-01B2: Job Integration Tests", () => {
    before(async () => {
        await connectTestDB();
    });

    after(async () => {
        await disconnectTestDB();
    });

    beforeEach(async () => {
        await clearTestDB();
    });

    // Helper: Create a user directly in DB and generate a signed JWT
    const createTestUser = async ({
        name = "Test User",
        email = `user-${Date.now()}-${Math.random().toString(36).substring(7)}@example.com`,
        password = "password123",
        role = "student",
        skills = []
    } = {}) => {
        const hashedPassword = await bcrypt.hash(password, 10);
        const user = await User.create({
            name,
            email,
            password: hashedPassword,
            role,
            skills
        });
        const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
            expiresIn: "7d"
        });
        return { user, token };
    };

    // Helper: Build a valid job payload with future deadline
    const getValidJobPayload = (overrides = {}) => ({
        title: "Senior Node.js Engineer",
        company: "TechBridge Innovations",
        location: "San Francisco, CA",
        jobType: "Full-Time",
        salary: "$120,000 - $150,000",
        description: "Develop enterprise-grade microservices and backend architectures using Node.js and Express.",
        requirements: ["5+ years backend experience", "Strong knowledge of MongoDB"],
        skillsRequired: ["Node.js", "Express", "MongoDB", "JavaScript"],
        experienceLevel: "3+ Years",
        deadline: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
        ...overrides
    });

    // ==========================================
    // 1. POST /api/jobs
    // ==========================================
    describe("1. POST /api/jobs", () => {
        it("Recruiter can create a valid job (HTTP 201) and verify saved job and createdBy", async () => {
            const { user: recruiter, token: recruiterToken } = await createTestUser({ role: "recruiter" });
            const payload = getValidJobPayload();

            const res = await request(app)
                .post("/api/jobs")
                .set("Authorization", `Bearer ${recruiterToken}`)
                .send(payload);

            assert.strictEqual(res.status, 201);
            assert.strictEqual(res.body.success, true);
            assert.strictEqual(res.body.message, "Job created successfully");
            assert.ok(res.body.job);
            assert.strictEqual(res.body.job.title, payload.title);
            assert.strictEqual(res.body.job.company, payload.company);
            assert.strictEqual(res.body.job.createdBy, recruiter._id.toString());

            // Verify persistence in actual database
            const savedJob = await Job.findById(res.body.job._id);
            assert.ok(savedJob, "Job should be persisted in database");
            assert.strictEqual(savedJob.title, payload.title);
            assert.strictEqual(savedJob.createdBy.toString(), recruiter._id.toString());
        });

        it("Unauthenticated request returns HTTP 401", async () => {
            const payload = getValidJobPayload();

            const res = await request(app)
                .post("/api/jobs")
                .send(payload);

            assert.strictEqual(res.status, 401);
            assert.strictEqual(res.body.success, false);
            assert.strictEqual(res.body.message, "Access Denied. No token provided.");
        });

        it("Student attempting job creation returns HTTP 403", async () => {
            const { token: studentToken } = await createTestUser({ role: "student" });
            const payload = getValidJobPayload();

            const res = await request(app)
                .post("/api/jobs")
                .set("Authorization", `Bearer ${studentToken}`)
                .send(payload);

            assert.strictEqual(res.status, 403);
            assert.strictEqual(res.body.success, false);
            assert.strictEqual(res.body.message, "Access denied. recruiter access required.");
        });

        it("Invalid job payload returns HTTP 400", async () => {
            const { token: recruiterToken } = await createTestUser({ role: "recruiter" });

            // Missing title and description too short (< 20 chars)
            const invalidPayload = getValidJobPayload({
                title: "",
                description: "Too short"
            });

            const res = await request(app)
                .post("/api/jobs")
                .set("Authorization", `Bearer ${recruiterToken}`)
                .send(invalidPayload);

            assert.strictEqual(res.status, 400);
            assert.strictEqual(res.body.success, false);
            assert.ok(typeof res.body.message === "string");
        });

        it("Invalid job type returns HTTP 400", async () => {
            const { token: recruiterToken } = await createTestUser({ role: "recruiter" });

            const invalidJobTypePayload = getValidJobPayload({
                jobType: "Freelance" // Not in allowed enum
            });

            const res = await request(app)
                .post("/api/jobs")
                .set("Authorization", `Bearer ${recruiterToken}`)
                .send(invalidJobTypePayload);

            assert.strictEqual(res.status, 400);
            assert.strictEqual(res.body.success, false);
            assert.ok(typeof res.body.message === "string");
        });
    });

    // ==========================================
    // 2. GET /api/jobs
    // ==========================================
    describe("2. GET /api/jobs", () => {
        let recruiter;

        beforeEach(async () => {
            const created = await createTestUser({ role: "recruiter" });
            recruiter = created.user;
        });

        it("Returns jobs list and correct pagination metadata", async () => {
            await Job.create([
                getValidJobPayload({ title: "Frontend Engineer", company: "Company A", createdBy: recruiter._id }),
                getValidJobPayload({ title: "Backend Engineer", company: "Company B", createdBy: recruiter._id }),
                getValidJobPayload({ title: "DevOps Engineer", company: "Company C", createdBy: recruiter._id })
            ]);

            const res = await request(app).get("/api/jobs");

            assert.strictEqual(res.status, 200);
            assert.strictEqual(res.body.success, true);
            assert.strictEqual(res.body.count, 3);
            assert.strictEqual(res.body.pagination.totalJobs, 3);
            assert.strictEqual(res.body.pagination.limit, 10);
            assert.strictEqual(res.body.pagination.currentPage, 1);
            assert.strictEqual(res.body.pagination.totalPages, 1);
            assert.strictEqual(res.body.pagination.hasNextPage, false);
            assert.strictEqual(res.body.pagination.hasPreviousPage, false);
            assert.strictEqual(res.body.jobs.length, 3);
        });

        it("Search across title, company and description", async () => {
            await Job.create([
                getValidJobPayload({
                    title: "React Frontend Specialist",
                    company: "Alpha Corp",
                    description: "Build user interfaces using modern CSS and state management.",
                    createdBy: recruiter._id
                }),
                getValidJobPayload({
                    title: "System Architect",
                    company: "BetaCloud Systems",
                    description: "Design high throughput microservices and cloud backends.",
                    createdBy: recruiter._id
                }),
                getValidJobPayload({
                    title: "Infrastructure Specialist",
                    company: "Gamma Global",
                    description: "Manage Kubernetes clusters, Docker containers and observability.",
                    createdBy: recruiter._id
                })
            ]);

            // Search by title keyword
            const resTitle = await request(app).get("/api/jobs?search=React");
            assert.strictEqual(resTitle.status, 200);
            assert.strictEqual(resTitle.body.pagination.totalJobs, 1);
            assert.strictEqual(resTitle.body.jobs[0].title, "React Frontend Specialist");

            // Search by company keyword
            const resCompany = await request(app).get("/api/jobs?search=BetaCloud");
            assert.strictEqual(resCompany.status, 200);
            assert.strictEqual(resCompany.body.pagination.totalJobs, 1);
            assert.strictEqual(resCompany.body.jobs[0].company, "BetaCloud Systems");

            // Search by description keyword
            const resDesc = await request(app).get("/api/jobs?search=Kubernetes");
            assert.strictEqual(resDesc.status, 200);
            assert.strictEqual(resDesc.body.pagination.totalJobs, 1);
            assert.strictEqual(resDesc.body.jobs[0].company, "Gamma Global");
        });

        it("Filter by location (case-insensitive), jobType and experienceLevel", async () => {
            await Job.create([
                getValidJobPayload({
                    title: "Junior Dev",
                    location: "San Francisco, CA",
                    jobType: "Full-Time",
                    experienceLevel: "Fresher",
                    createdBy: recruiter._id
                }),
                getValidJobPayload({
                    title: "Contract Lead",
                    location: "Remote, US",
                    jobType: "Contract",
                    experienceLevel: "3+ Years",
                    createdBy: recruiter._id
                }),
                getValidJobPayload({
                    title: "Mid-level Engineer",
                    location: "New York, NY",
                    jobType: "Part-Time",
                    experienceLevel: "1-3 Years",
                    createdBy: recruiter._id
                })
            ]);

            // Filter location case-insensitive
            const resLocation = await request(app).get("/api/jobs?location=san francisco");
            assert.strictEqual(resLocation.status, 200);
            assert.strictEqual(resLocation.body.count, 1);
            assert.strictEqual(resLocation.body.jobs[0].location, "San Francisco, CA");

            // Filter by jobType
            const resJobType = await request(app).get("/api/jobs?jobType=Contract");
            assert.strictEqual(resJobType.status, 200);
            assert.strictEqual(resJobType.body.count, 1);
            assert.strictEqual(resJobType.body.jobs[0].jobType, "Contract");

            // Filter by experienceLevel
            const resExp = await request(app).get("/api/jobs?experienceLevel=1-3 Years");
            assert.strictEqual(resExp.status, 200);
            assert.strictEqual(resExp.body.count, 1);
            assert.strictEqual(resExp.body.jobs[0].experienceLevel, "1-3 Years");
        });

        it("Verify pagination returns different records on different pages", async () => {
            // Create jobs with distinct titles and sequential timestamps
            const baseTime = Date.now();
            await Job.create([
                getValidJobPayload({ title: "Job 1", createdBy: recruiter._id, createdAt: new Date(baseTime + 1000) }),
                getValidJobPayload({ title: "Job 2", createdBy: recruiter._id, createdAt: new Date(baseTime + 2000) }),
                getValidJobPayload({ title: "Job 3", createdBy: recruiter._id, createdAt: new Date(baseTime + 3000) }),
                getValidJobPayload({ title: "Job 4", createdBy: recruiter._id, createdAt: new Date(baseTime + 4000) })
            ]);

            // Request Page 1 with limit 2
            const resPage1 = await request(app).get("/api/jobs?page=1&limit=2");
            assert.strictEqual(resPage1.status, 200);
            assert.strictEqual(resPage1.body.jobs.length, 2);
            assert.strictEqual(resPage1.body.pagination.currentPage, 1);
            assert.strictEqual(resPage1.body.pagination.hasNextPage, true);
            assert.strictEqual(resPage1.body.pagination.hasPreviousPage, false);

            const page1Ids = resPage1.body.jobs.map(j => j._id);

            // Request Page 2 with limit 2
            const resPage2 = await request(app).get("/api/jobs?page=2&limit=2");
            assert.strictEqual(resPage2.status, 200);
            assert.strictEqual(resPage2.body.jobs.length, 2);
            assert.strictEqual(resPage2.body.pagination.currentPage, 2);
            assert.strictEqual(resPage2.body.pagination.hasNextPage, false);
            assert.strictEqual(resPage2.body.pagination.hasPreviousPage, true);

            const page2Ids = resPage2.body.jobs.map(j => j._id);

            // Page 1 and Page 2 must not contain overlapping jobs
            for (const id of page1Ids) {
                assert.ok(!page2Ids.includes(id), `Page 2 should not contain job ID ${id} from Page 1`);
            }
        });

        it("Requested limit above 50 is clamped to 50", async () => {
            const jobsToCreate = Array.from({ length: 51 }, (_, i) =>
                getValidJobPayload({
                    title: `Clamped Job ${i + 1}`,
                    createdBy: recruiter._id,
                    deadline: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString()
                })
            );
            await Job.create(jobsToCreate);

            const res = await request(app).get("/api/jobs?limit=100");

            assert.strictEqual(res.status, 200);
            assert.strictEqual(res.body.pagination.limit, 50);
            assert.strictEqual(res.body.pagination.totalJobs, 51);
            assert.strictEqual(res.body.jobs.length, 50);
        });
    });

    // ==========================================
    // 3. GET /api/jobs/:id
    // ==========================================
    describe("3. GET /api/jobs/:id", () => {
        let recruiter;
        let job;

        beforeEach(async () => {
            const created = await createTestUser({
                name: "Lead Recruiter",
                email: "recruiter.lead@example.com",
                role: "recruiter"
            });
            recruiter = created.user;

            job = await Job.create(getValidJobPayload({
                title: "Principal Architect",
                createdBy: recruiter._id
            }));
        });

        it("Valid ID returns HTTP 200 with populated recruiter information", async () => {
            const res = await request(app).get(`/api/jobs/${job._id}`);

            assert.strictEqual(res.status, 200);
            assert.strictEqual(res.body.success, true);
            assert.ok(res.body.job);
            assert.strictEqual(res.body.job._id.toString(), job._id.toString());
            assert.strictEqual(res.body.job.title, "Principal Architect");

            // Verify populated recruiter info
            assert.ok(res.body.job.createdBy);
            assert.strictEqual(res.body.job.createdBy.name, recruiter.name);
            assert.strictEqual(res.body.job.createdBy.email, recruiter.email);
        });

        it("Malformed ObjectId returns HTTP 400", async () => {
            const res = await request(app).get("/api/jobs/invalid-object-id");

            assert.strictEqual(res.status, 400);
            assert.strictEqual(res.body.success, false);
            assert.strictEqual(res.body.message, "Invalid job ID");
        });

        it("Valid but nonexistent ObjectId returns HTTP 404", async () => {
            const nonExistentId = new mongoose.Types.ObjectId();
            const res = await request(app).get(`/api/jobs/${nonExistentId}`);

            assert.strictEqual(res.status, 404);
            assert.strictEqual(res.body.success, false);
            assert.strictEqual(res.body.message, "Job not found");
        });
    });

    // ==========================================
    // 4. GET /api/jobs/recommended
    // ==========================================
    describe("4. GET /api/jobs/recommended", () => {
        let recruiter;

        beforeEach(async () => {
            const created = await createTestUser({ role: "recruiter" });
            recruiter = created.user;
        });

        it("Unauthenticated request returns HTTP 401", async () => {
            const res = await request(app).get("/api/jobs/recommended");

            assert.strictEqual(res.status, 401);
            assert.strictEqual(res.body.success, false);
            assert.strictEqual(res.body.message, "Access Denied. No token provided.");
        });

        it("Recruiter request returns HTTP 403", async () => {
            const { token: recruiterToken } = await createTestUser({ role: "recruiter" });

            const res = await request(app)
                .get("/api/jobs/recommended")
                .set("Authorization", `Bearer ${recruiterToken}`);

            assert.strictEqual(res.status, 403);
            assert.strictEqual(res.body.success, false);
            assert.strictEqual(res.body.message, "Access denied. student access required.");
        });

        it("Student without skills returns HTTP 400", async () => {
            const { token: studentToken } = await createTestUser({ role: "student", skills: [] });

            const res = await request(app)
                .get("/api/jobs/recommended")
                .set("Authorization", `Bearer ${studentToken}`);

            assert.strictEqual(res.status, 400);
            assert.strictEqual(res.body.success, false);
            assert.strictEqual(res.body.message, "Please add your skills to get job recommendations");
        });

        it("Student with skills receives matching jobs, excludes zero-match jobs, and sorts descending", async () => {
            // Student has: ["JavaScript", "Node.js", "MongoDB"]
            const { token: studentToken } = await createTestUser({
                role: "student",
                skills: ["JavaScript", "Node.js", "MongoDB"]
            });

            // Job 1: skillsRequired: ["node.js", "mongodb"] -> 2/2 matches = 100%
            await Job.create(getValidJobPayload({
                title: "100% Match Job",
                skillsRequired: ["node.js", "mongodb"],
                createdBy: recruiter._id
            }));

            // Job 2: skillsRequired: ["JavaScript", "Python"] -> 1/2 matches = 50%
            await Job.create(getValidJobPayload({
                title: "50% Match Job",
                skillsRequired: ["JavaScript", "Python"],
                createdBy: recruiter._id
            }));

            // Job 3: skillsRequired: ["Rust", "Go"] -> 0/2 matches = 0% (must be excluded)
            await Job.create(getValidJobPayload({
                title: "Zero Match Job",
                skillsRequired: ["Rust", "Go"],
                createdBy: recruiter._id
            }));

            const res = await request(app)
                .get("/api/jobs/recommended")
                .set("Authorization", `Bearer ${studentToken}`);

            assert.strictEqual(res.status, 200);
            assert.strictEqual(res.body.success, true);
            assert.strictEqual(res.body.count, 2);
            assert.strictEqual(res.body.jobs.length, 2);

            // Verify zero-match job is excluded
            const titles = res.body.jobs.map(j => j.title);
            assert.ok(!titles.includes("Zero Match Job"), "Zero match job should be excluded");

            // Verify results are sorted by descending matchPercentage
            assert.strictEqual(res.body.jobs[0].title, "100% Match Job");
            assert.strictEqual(res.body.jobs[0].matchPercentage, 100);

            assert.strictEqual(res.body.jobs[1].title, "50% Match Job");
            assert.strictEqual(res.body.jobs[1].matchPercentage, 50);

            assert.ok(res.body.jobs[0].matchPercentage >= res.body.jobs[1].matchPercentage);
        });
    });

    // ==========================================
    // 5. PUT /api/jobs/:id
    // ==========================================
    describe("5. PUT /api/jobs/:id", () => {
        let ownerRecruiter;
        let ownerToken;
        let otherRecruiter;
        let otherToken;
        let studentToken;
        let job;

        beforeEach(async () => {
            const owner = await createTestUser({ role: "recruiter" });
            ownerRecruiter = owner.user;
            ownerToken = owner.token;

            const other = await createTestUser({ role: "recruiter" });
            otherRecruiter = other.user;
            otherToken = other.token;

            const student = await createTestUser({ role: "student" });
            studentToken = student.token;

            job = await Job.create(getValidJobPayload({
                title: "Original Title",
                salary: "$100,000",
                createdBy: ownerRecruiter._id
            }));
        });

        it("Owner recruiter can update a job (HTTP 200) and changes persist in database", async () => {
            const updatePayload = {
                title: "Updated Senior Title",
                salary: "$130,000 - $160,000"
            };

            const res = await request(app)
                .put(`/api/jobs/${job._id}`)
                .set("Authorization", `Bearer ${ownerToken}`)
                .send(updatePayload);

            assert.strictEqual(res.status, 200);
            assert.strictEqual(res.body.success, true);
            assert.strictEqual(res.body.message, "Job updated successfully");
            assert.strictEqual(res.body.job.title, "Updated Senior Title");
            assert.strictEqual(res.body.job.salary, "$130,000 - $160,000");

            // Verify database reflects successful changes
            const dbJob = await Job.findById(job._id);
            assert.strictEqual(dbJob.title, "Updated Senior Title");
            assert.strictEqual(dbJob.salary, "$130,000 - $160,000");
        });

        it("Another recruiter cannot update the job (HTTP 403)", async () => {
            const res = await request(app)
                .put(`/api/jobs/${job._id}`)
                .set("Authorization", `Bearer ${otherToken}`)
                .send({ title: "Malicious Recruiter Update" });

            assert.strictEqual(res.status, 403);
            assert.strictEqual(res.body.success, false);
            assert.strictEqual(res.body.message, "You are not authorized to update this job");

            // Verify database was not modified
            const dbJob = await Job.findById(job._id);
            assert.strictEqual(dbJob.title, "Original Title");
        });

        it("Student cannot update a job (HTTP 403)", async () => {
            const res = await request(app)
                .put(`/api/jobs/${job._id}`)
                .set("Authorization", `Bearer ${studentToken}`)
                .send({ title: "Student Attempted Update" });

            assert.strictEqual(res.status, 403);
            assert.strictEqual(res.body.success, false);
            assert.strictEqual(res.body.message, "Access denied. recruiter access required.");
        });

        it("Nonexistent valid ID returns HTTP 404", async () => {
            const nonExistentId = new mongoose.Types.ObjectId();

            const res = await request(app)
                .put(`/api/jobs/${nonExistentId}`)
                .set("Authorization", `Bearer ${ownerToken}`)
                .send({ title: "Update Nonexistent" });

            assert.strictEqual(res.status, 404);
            assert.strictEqual(res.body.success, false);
            assert.strictEqual(res.body.message, "Job not found");
        });

        it("Invalid update payload returns HTTP 400", async () => {
            // Description must be at least 20 characters
            const res = await request(app)
                .put(`/api/jobs/${job._id}`)
                .set("Authorization", `Bearer ${ownerToken}`)
                .send({ description: "Too short" });

            assert.strictEqual(res.status, 400);
            assert.strictEqual(res.body.success, false);
            assert.ok(typeof res.body.message === "string");
        });

        it("Malformed ObjectId returns HTTP 500 (KNOWN ISSUE: BE-07)", async () => {
            // KNOWN ISSUE: BE-07
            // updateJob does not validate if req.params.id is a valid ObjectId before calling
            // Job.findById. Mongoose throws a CastError, which gets caught and returns HTTP 500
            // instead of returning an HTTP 400 "Invalid job ID".
            const res = await request(app)
                .put("/api/jobs/malformed-object-id")
                .set("Authorization", `Bearer ${ownerToken}`)
                .send({ title: "Valid Title" });

            assert.strictEqual(res.status, 500);
            assert.strictEqual(res.body.success, false);
            assert.strictEqual(res.body.message, "Internal Server Error");
        });
    });

    // ==========================================
    // 6. DELETE /api/jobs/:id
    // ==========================================
    describe("6. DELETE /api/jobs/:id", () => {
        let ownerRecruiter;
        let ownerToken;
        let otherRecruiter;
        let otherToken;
        let studentToken;
        let job;

        beforeEach(async () => {
            const owner = await createTestUser({ role: "recruiter" });
            ownerRecruiter = owner.user;
            ownerToken = owner.token;

            const other = await createTestUser({ role: "recruiter" });
            otherRecruiter = other.user;
            otherToken = other.token;

            const student = await createTestUser({ role: "student" });
            studentToken = student.token;

            job = await Job.create(getValidJobPayload({
                title: "Job To Delete",
                createdBy: ownerRecruiter._id
            }));
        });

        it("Owner recruiter can delete a job (HTTP 200) and job is removed from database", async () => {
            const res = await request(app)
                .delete(`/api/jobs/${job._id}`)
                .set("Authorization", `Bearer ${ownerToken}`);

            assert.strictEqual(res.status, 200);
            assert.strictEqual(res.body.success, true);
            assert.strictEqual(res.body.message, "Job deleted successfully");

            // Verify the job is actually removed from database
            const dbJob = await Job.findById(job._id);
            assert.strictEqual(dbJob, null);
        });

        it("Another recruiter cannot delete the job (HTTP 403)", async () => {
            const res = await request(app)
                .delete(`/api/jobs/${job._id}`)
                .set("Authorization", `Bearer ${otherToken}`);

            assert.strictEqual(res.status, 403);
            assert.strictEqual(res.body.success, false);
            assert.strictEqual(res.body.message, "You are not authorized to delete this job");

            // Verify job is still present in database
            const dbJob = await Job.findById(job._id);
            assert.ok(dbJob);
        });

        it("Student cannot delete a job (HTTP 403)", async () => {
            const res = await request(app)
                .delete(`/api/jobs/${job._id}`)
                .set("Authorization", `Bearer ${studentToken}`);

            assert.strictEqual(res.status, 403);
            assert.strictEqual(res.body.success, false);
            assert.strictEqual(res.body.message, "Access denied. recruiter access required.");

            // Verify job is still present in database
            const dbJob = await Job.findById(job._id);
            assert.ok(dbJob);
        });

        it("Nonexistent valid ID returns HTTP 404", async () => {
            const nonExistentId = new mongoose.Types.ObjectId();

            const res = await request(app)
                .delete(`/api/jobs/${nonExistentId}`)
                .set("Authorization", `Bearer ${ownerToken}`);

            assert.strictEqual(res.status, 404);
            assert.strictEqual(res.body.success, false);
            assert.strictEqual(res.body.message, "Job not found");
        });

        it("Malformed ObjectId returns HTTP 500 (KNOWN ISSUE: BE-07)", async () => {
            // KNOWN ISSUE: BE-07
            // deleteJob does not validate if req.params.id is a valid ObjectId before calling
            // Job.findById. Mongoose throws a CastError, which gets caught and returns HTTP 500
            // instead of returning an HTTP 400 "Invalid job ID".
            const res = await request(app)
                .delete("/api/jobs/malformed-object-id")
                .set("Authorization", `Bearer ${ownerToken}`);

            assert.strictEqual(res.status, 500);
            assert.strictEqual(res.body.success, false);
            assert.strictEqual(res.body.message, "Internal Server Error");
        });
    });
});
