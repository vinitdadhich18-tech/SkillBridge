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
const Application = require("../models/Application");
const { connectTestDB, clearTestDB, disconnectTestDB } = require("./helpers/db");

describe("BE-01B3: Application Integration Tests", () => {
    before(async () => {
        await connectTestDB();
        await Application.init();
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
        resume,
        skills = []
    } = {}) => {
        const hashedPassword = await bcrypt.hash(password, 10);
        const userData = {
            name,
            email,
            password: hashedPassword,
            role,
            skills
        };
        if (resume !== undefined) {
            userData.resume = resume;
        }
        const user = await User.create(userData);
        const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
            expiresIn: "1d"
        });
        return { user, token };
    };

    // Helper: Create a student with resume uploaded
    const createStudentWithResume = async (overrides = {}) => {
        return createTestUser({
            name: "Student Applicant",
            role: "student",
            skills: ["JavaScript", "Node.js"],
            resume: {
                url: "https://res.cloudinary.com/test/resume.pdf",
                public_id: "resumes/test_resume"
            },
            ...overrides
        });
    };

    // Helper: Create a recruiter
    const createRecruiter = async (overrides = {}) => {
        return createTestUser({
            name: "Hiring Manager",
            role: "recruiter",
            ...overrides
        });
    };

    // Helper: Create an active job created by a recruiter
    const createActiveJob = async (recruiterId, overrides = {}) => {
        return Job.create({
            title: "Software Engineer",
            company: "Tech Corp",
            description: "Build robust web applications and backend services.",
            location: "Remote",
            jobType: "Full-Time",
            salary: "$90,000",
            requirements: ["Node.js", "Express"],
            skillsRequired: ["JavaScript", "Node.js"],
            experienceLevel: "Fresher",
            deadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days in future
            createdBy: recruiterId,
            ...overrides
        });
    };

    // Helper: Create an application directly in DB
    const createApplicationDoc = async (jobId, studentId, overrides = {}) => {
        return Application.create({
            job: jobId,
            applicant: studentId,
            resumeUrl: "https://res.cloudinary.com/test/resume.pdf",
            resumePublicId: "resumes/test_resume",
            coverLetter: "Excited about this role.",
            status: "Applied",
            ...overrides
        });
    };

    // =========================================================================
    // Suite A: POST /api/applications/job/:jobId (Student applies for a job)
    // =========================================================================
    describe("POST /api/applications/job/:jobId", () => {
        it("Student with uploaded resume applies successfully", async () => {
            const recruiter = await createRecruiter();
            const job = await createActiveJob(recruiter.user._id);
            const student = await createStudentWithResume();

            const res = await request(app)
                .post(`/api/applications/job/${job._id}`)
                .set("Authorization", `Bearer ${student.token}`)
                .send({
                    coverLetter: "I am deeply interested in this engineering role."
                });

            assert.equal(res.status, 201);
            assert.equal(res.body.success, true);
            assert.equal(res.body.message, "Application submitted successfully");
            assert.ok(res.body.application._id);
            assert.equal(res.body.application.status, "Applied");
            assert.equal(res.body.application.coverLetter, "I am deeply interested in this engineering role.");
            assert.equal(res.body.application.resumeUrl, student.user.resume.url);
            assert.equal(res.body.application.resumePublicId, student.user.resume.public_id);
            assert.equal(res.body.application.job._id, job._id.toString());
            assert.equal(res.body.application.job.title, "Software Engineer");
            assert.equal(res.body.application.applicant._id, student.user._id.toString());
            assert.equal(res.body.application.applicant.name, student.user.name);

            // Direct DB verification
            const dbApp = await Application.findById(res.body.application._id);
            assert.ok(dbApp);
            assert.equal(dbApp.job.toString(), job._id.toString());
            assert.equal(dbApp.applicant.toString(), student.user._id.toString());
            assert.equal(dbApp.resumeUrl, student.user.resume.url);
            assert.equal(dbApp.resumePublicId, student.user.resume.public_id);
            assert.equal(dbApp.coverLetter, "I am deeply interested in this engineering role.");
            assert.equal(dbApp.status, "Applied");
        });

        it("Student applies successfully without cover letter", async () => {
            const recruiter = await createRecruiter();
            const job = await createActiveJob(recruiter.user._id);
            const student = await createStudentWithResume();

            const res = await request(app)
                .post(`/api/applications/job/${job._id}`)
                .set("Authorization", `Bearer ${student.token}`)
                .send({});

            assert.equal(res.status, 201);
            assert.equal(res.body.success, true);
            assert.equal(res.body.application.coverLetter, "");

            const dbApp = await Application.findById(res.body.application._id);
            assert.ok(dbApp);
            assert.equal(dbApp.coverLetter, "");
        });

        it("Unauthenticated request is rejected with 401", async () => {
            const recruiter = await createRecruiter();
            const job = await createActiveJob(recruiter.user._id);

            const res = await request(app)
                .post(`/api/applications/job/${job._id}`)
                .send({ coverLetter: "No auth token provided." });

            assert.equal(res.status, 401);
            assert.equal(res.body.success, false);
            assert.equal(res.body.message, "Access Denied. No token provided.");

            const count = await Application.countDocuments();
            assert.equal(count, 0);
        });

        it("Recruiter cannot apply for a job (rejected with 403)", async () => {
            const recruiter1 = await createRecruiter();
            const job = await createActiveJob(recruiter1.user._id);
            const recruiter2 = await createRecruiter();

            const res = await request(app)
                .post(`/api/applications/job/${job._id}`)
                .set("Authorization", `Bearer ${recruiter2.token}`)
                .send({ coverLetter: "Recruiter trying to apply." });

            assert.equal(res.status, 403);
            assert.equal(res.body.success, false);
            assert.equal(res.body.message, "Access denied. student access required.");

            const count = await Application.countDocuments();
            assert.equal(count, 0);
        });

        it("Malformed job ID returns 400", async () => {
            const student = await createStudentWithResume();

            const res = await request(app)
                .post("/api/applications/job/invalid-job-id")
                .set("Authorization", `Bearer ${student.token}`)
                .send({ coverLetter: "Applying to invalid id." });

            assert.equal(res.status, 400);
            assert.equal(res.body.success, false);
            assert.equal(res.body.message, "Invalid job ID");

            const count = await Application.countDocuments();
            assert.equal(count, 0);
        });

        it("Nonexistent job ID returns 404", async () => {
            const student = await createStudentWithResume();
            const nonExistentId = new mongoose.Types.ObjectId();

            const res = await request(app)
                .post(`/api/applications/job/${nonExistentId}`)
                .set("Authorization", `Bearer ${student.token}`)
                .send({ coverLetter: "Applying to ghost job." });

            assert.equal(res.status, 404);
            assert.equal(res.body.success, false);
            assert.equal(res.body.message, "Job not found");

            const count = await Application.countDocuments();
            assert.equal(count, 0);
        });

        it("Expired job deadline returns 400", async () => {
            const recruiter = await createRecruiter();
            const expiredJob = await createActiveJob(recruiter.user._id, {
                deadline: new Date(Date.now() - 24 * 60 * 60 * 1000) // 1 day in the past
            });
            const student = await createStudentWithResume();

            const res = await request(app)
                .post(`/api/applications/job/${expiredJob._id}`)
                .set("Authorization", `Bearer ${student.token}`)
                .send({ coverLetter: "Late submission." });

            assert.equal(res.status, 400);
            assert.equal(res.body.success, false);
            assert.equal(res.body.message, "Application deadline has passed");

            const count = await Application.countDocuments();
            assert.equal(count, 0);
        });

        it("Student without uploaded resume returns 400", async () => {
            const recruiter = await createRecruiter();
            const job = await createActiveJob(recruiter.user._id);
            const studentWithoutResume = await createTestUser({
                name: "No Resume Student",
                role: "student"
                // resume is undefined
            });

            const res = await request(app)
                .post(`/api/applications/job/${job._id}`)
                .set("Authorization", `Bearer ${studentWithoutResume.token}`)
                .send({ coverLetter: "I do not have a resume uploaded." });

            assert.equal(res.status, 400);
            assert.equal(res.body.success, false);
            assert.equal(res.body.message, "Please upload your resume before applying");

            const count = await Application.countDocuments();
            assert.equal(count, 0);
        });

        it("Cover letter exceeding 2000 characters returns 400", async () => {
            const recruiter = await createRecruiter();
            const job = await createActiveJob(recruiter.user._id);
            const student = await createStudentWithResume();

            const overlyLongCoverLetter = "a".repeat(2001);

            const res = await request(app)
                .post(`/api/applications/job/${job._id}`)
                .set("Authorization", `Bearer ${student.token}`)
                .send({ coverLetter: overlyLongCoverLetter });

            assert.equal(res.status, 400);
            assert.equal(res.body.success, false);
            assert.equal(res.body.message, "Cover letter cannot exceed 2000 characters");

            const count = await Application.countDocuments();
            assert.equal(count, 0);
        });

        it("Sequential duplicate application returns 409", async () => {
            const recruiter = await createRecruiter();
            const job = await createActiveJob(recruiter.user._id);
            const student = await createStudentWithResume();

            // First application succeeds
            const firstRes = await request(app)
                .post(`/api/applications/job/${job._id}`)
                .set("Authorization", `Bearer ${student.token}`)
                .send({ coverLetter: "First application." });

            assert.equal(firstRes.status, 201);
            assert.equal(firstRes.body.success, true);

            // Second application from same student for same job returns 409
            const secondRes = await request(app)
                .post(`/api/applications/job/${job._id}`)
                .set("Authorization", `Bearer ${student.token}`)
                .send({ coverLetter: "Duplicate attempt." });

            assert.equal(secondRes.status, 409);
            assert.equal(secondRes.body.success, false);
            assert.equal(secondRes.body.message, "You have already applied for this job");

            // Exactly 1 record remains in DB
            const count = await Application.countDocuments({
                job: job._id,
                applicant: student.user._id
            });
            assert.equal(count, 1);
        });
    });

    // =========================================================================
    // Suite B: GET /api/applications/my (Student retrieves own applications)
    // =========================================================================
    describe("GET /api/applications/my", () => {
        it("Student retrieves own applications sorted newest first", async () => {
            const recruiter = await createRecruiter();
            const job1 = await createActiveJob(recruiter.user._id, { title: "Frontend Engineer" });
            const job2 = await createActiveJob(recruiter.user._id, { title: "Backend Engineer" });
            const student = await createStudentWithResume();

            const app1 = await createApplicationDoc(job1._id, student.user._id, {
                createdAt: new Date(Date.now() - 10000)
            });
            const app2 = await createApplicationDoc(job2._id, student.user._id, {
                createdAt: new Date(Date.now())
            });

            const res = await request(app)
                .get("/api/applications/my")
                .set("Authorization", `Bearer ${student.token}`);

            assert.equal(res.status, 200);
            assert.equal(res.body.success, true);
            assert.equal(res.body.count, 2);
            assert.equal(res.body.applications.length, 2);

            // Sorted newest first: app2 then app1
            assert.equal(res.body.applications[0]._id, app2._id.toString());
            assert.equal(res.body.applications[0].job._id, job2._id.toString());
            assert.equal(res.body.applications[0].job.title, "Backend Engineer");
            assert.equal(res.body.applications[1]._id, app1._id.toString());
            assert.equal(res.body.applications[1].job._id, job1._id.toString());
            assert.equal(res.body.applications[1].job.title, "Frontend Engineer");
        });

        it("Unauthenticated request is rejected with 401", async () => {
            const res = await request(app).get("/api/applications/my");

            assert.equal(res.status, 401);
            assert.equal(res.body.success, false);
            assert.equal(res.body.message, "Access Denied. No token provided.");
        });

        it("Recruiter cannot access student applications endpoint (rejected with 403)", async () => {
            const recruiter = await createRecruiter();

            const res = await request(app)
                .get("/api/applications/my")
                .set("Authorization", `Bearer ${recruiter.token}`);

            assert.equal(res.status, 403);
            assert.equal(res.body.success, false);
            assert.equal(res.body.message, "Access denied. student access required.");
        });

        it("Student data isolation - student only sees their own applications", async () => {
            const recruiter = await createRecruiter();
            const job1 = await createActiveJob(recruiter.user._id);
            const job2 = await createActiveJob(recruiter.user._id);

            const studentA = await createStudentWithResume({ name: "Student A" });
            const studentB = await createStudentWithResume({ name: "Student B" });

            await createApplicationDoc(job1._id, studentA.user._id);
            await createApplicationDoc(job2._id, studentB.user._id);

            const resA = await request(app)
                .get("/api/applications/my")
                .set("Authorization", `Bearer ${studentA.token}`);

            assert.equal(resA.status, 200);
            assert.equal(resA.body.count, 1);
            assert.equal(resA.body.applications.length, 1);
            assert.equal(resA.body.applications[0].applicant.toString(), studentA.user._id.toString());
        });

        it("Orphaned application with deleted job returns 200 with job null", async () => {
            const recruiter = await createRecruiter();
            const job = await createActiveJob(recruiter.user._id);
            const student = await createStudentWithResume();

            await createApplicationDoc(job._id, student.user._id);

            // Directly delete the job document to simulate orphan scenario
            await Job.findByIdAndDelete(job._id);

            const res = await request(app)
                .get("/api/applications/my")
                .set("Authorization", `Bearer ${student.token}`);

            assert.equal(res.status, 200);
            assert.equal(res.body.success, true);
            assert.equal(res.body.count, 1);
            assert.equal(res.body.applications.length, 1);
            assert.equal(res.body.applications[0].job, null);
        });
    });

    // =========================================================================
    // Suite C: GET /api/applications/job/:jobId (Recruiter retrieves job applications)
    // =========================================================================
    describe("GET /api/applications/job/:jobId", () => {
        it("Job owner recruiter retrieves applicants successfully", async () => {
            const recruiter = await createRecruiter();
            const job = await createActiveJob(recruiter.user._id);
            const student1 = await createStudentWithResume({ name: "Alice", skills: ["React", "TypeScript"] });
            const student2 = await createStudentWithResume({ name: "Bob", skills: ["Python", "Django"] });

            await createApplicationDoc(job._id, student1.user._id, {
                createdAt: new Date(Date.now() - 5000)
            });
            await createApplicationDoc(job._id, student2.user._id, {
                createdAt: new Date(Date.now())
            });

            const res = await request(app)
                .get(`/api/applications/job/${job._id}`)
                .set("Authorization", `Bearer ${recruiter.token}`);

            assert.equal(res.status, 200);
            assert.equal(res.body.success, true);
            assert.equal(res.body.count, 2);
            assert.equal(res.body.applications.length, 2);

            // Populated applicant verification
            const applicants = res.body.applications.map((a) => a.applicant.name);
            assert.ok(applicants.includes("Alice"));
            assert.ok(applicants.includes("Bob"));
            const applicantWithSkills = res.body.applications.find((a) => a.applicant.name === "Alice");
            assert.ok(applicantWithSkills.applicant.skills.includes("React"));
        });

        it("Unauthenticated request is rejected with 401", async () => {
            const recruiter = await createRecruiter();
            const job = await createActiveJob(recruiter.user._id);

            const res = await request(app).get(`/api/applications/job/${job._id}`);

            assert.equal(res.status, 401);
            assert.equal(res.body.success, false);
            assert.equal(res.body.message, "Access Denied. No token provided.");
        });

        it("Student cannot access recruiter applications endpoint (rejected with 403)", async () => {
            const recruiter = await createRecruiter();
            const job = await createActiveJob(recruiter.user._id);
            const student = await createStudentWithResume();

            const res = await request(app)
                .get(`/api/applications/job/${job._id}`)
                .set("Authorization", `Bearer ${student.token}`);

            assert.equal(res.status, 403);
            assert.equal(res.body.success, false);
            assert.equal(res.body.message, "Access denied. recruiter access required.");
        });

        it("Non-owner recruiter cannot view applications for another recruiter's job (rejected with 403)", async () => {
            const ownerRecruiter = await createRecruiter();
            const job = await createActiveJob(ownerRecruiter.user._id);
            const otherRecruiter = await createRecruiter();
            const student = await createStudentWithResume();
            await createApplicationDoc(job._id, student.user._id);

            const res = await request(app)
                .get(`/api/applications/job/${job._id}`)
                .set("Authorization", `Bearer ${otherRecruiter.token}`);

            assert.equal(res.status, 403);
            assert.equal(res.body.success, false);
            assert.equal(res.body.message, "You are not authorized to view these applications");
            assert.equal(res.body.applications, undefined);
            assert.equal(res.body.application, undefined);
        });

        it("Malformed job ID returns 400", async () => {
            const recruiter = await createRecruiter();

            const res = await request(app)
                .get("/api/applications/job/not-a-valid-job-id")
                .set("Authorization", `Bearer ${recruiter.token}`);

            assert.equal(res.status, 400);
            assert.equal(res.body.success, false);
            assert.equal(res.body.message, "Invalid job ID");
        });

        it("Nonexistent job ID returns 404", async () => {
            const recruiter = await createRecruiter();
            const nonExistentId = new mongoose.Types.ObjectId();

            const res = await request(app)
                .get(`/api/applications/job/${nonExistentId}`)
                .set("Authorization", `Bearer ${recruiter.token}`);

            assert.equal(res.status, 404);
            assert.equal(res.body.success, false);
            assert.equal(res.body.message, "Job not found");
        });

        it("Recruiter views job with zero applicants returns count 0", async () => {
            const recruiter = await createRecruiter();
            const job = await createActiveJob(recruiter.user._id);

            const res = await request(app)
                .get(`/api/applications/job/${job._id}`)
                .set("Authorization", `Bearer ${recruiter.token}`);

            assert.equal(res.status, 200);
            assert.equal(res.body.success, true);
            assert.equal(res.body.count, 0);
            assert.deepEqual(res.body.applications, []);
        });
    });

    // =========================================================================
    // Suite D: PUT /api/applications/:id/status (Recruiter updates status)
    // =========================================================================
    describe("PUT /api/applications/:id/status", () => {
        it("Job owner recruiter updates status across valid enum values", async () => {
            const recruiter = await createRecruiter();
            const job = await createActiveJob(recruiter.user._id);
            const student = await createStudentWithResume();
            const application = await createApplicationDoc(job._id, student.user._id);

            const validStatuses = ["Under Review", "Shortlisted", "Accepted", "Rejected"];

            for (const newStatus of validStatuses) {
                const res = await request(app)
                    .put(`/api/applications/${application._id}/status`)
                    .set("Authorization", `Bearer ${recruiter.token}`)
                    .send({ status: newStatus });

                assert.equal(res.status, 200);
                assert.equal(res.body.success, true);
                assert.equal(res.body.message, "Application status updated successfully");
                assert.equal(res.body.application.status, newStatus);

                // Direct DB check
                const dbApp = await Application.findById(application._id);
                assert.equal(dbApp.status, newStatus);
            }
        });

        it("Unauthenticated request is rejected with 401", async () => {
            const recruiter = await createRecruiter();
            const job = await createActiveJob(recruiter.user._id);
            const student = await createStudentWithResume();
            const application = await createApplicationDoc(job._id, student.user._id);

            const res = await request(app)
                .put(`/api/applications/${application._id}/status`)
                .send({ status: "Under Review" });

            assert.equal(res.status, 401);
            assert.equal(res.body.success, false);
            assert.equal(res.body.message, "Access Denied. No token provided.");

            const dbApp = await Application.findById(application._id);
            assert.equal(dbApp.status, "Applied");
        });

        it("Student cannot update application status (rejected with 403)", async () => {
            const recruiter = await createRecruiter();
            const job = await createActiveJob(recruiter.user._id);
            const student = await createStudentWithResume();
            const application = await createApplicationDoc(job._id, student.user._id);

            const res = await request(app)
                .put(`/api/applications/${application._id}/status`)
                .set("Authorization", `Bearer ${student.token}`)
                .send({ status: "Accepted" });

            assert.equal(res.status, 403);
            assert.equal(res.body.success, false);
            assert.equal(res.body.message, "Access denied. recruiter access required.");

            const dbApp = await Application.findById(application._id);
            assert.equal(dbApp.status, "Applied");
        });

        it("Non-owner recruiter cannot update application status (rejected with 403)", async () => {
            const ownerRecruiter = await createRecruiter();
            const job = await createActiveJob(ownerRecruiter.user._id);
            const student = await createStudentWithResume();
            const application = await createApplicationDoc(job._id, student.user._id);
            const otherRecruiter = await createRecruiter();

            const res = await request(app)
                .put(`/api/applications/${application._id}/status`)
                .set("Authorization", `Bearer ${otherRecruiter.token}`)
                .send({ status: "Under Review" });

            assert.equal(res.status, 403);
            assert.equal(res.body.success, false);
            assert.equal(res.body.message, "You are not authorized to update this application");

            const dbApp = await Application.findById(application._id);
            assert.equal(dbApp.status, "Applied");
        });

        it("Malformed application ID returns 400", async () => {
            const recruiter = await createRecruiter();

            const res = await request(app)
                .put("/api/applications/not-a-valid-id/status")
                .set("Authorization", `Bearer ${recruiter.token}`)
                .send({ status: "Under Review" });

            assert.equal(res.status, 400);
            assert.equal(res.body.success, false);
            assert.equal(res.body.message, "Invalid application ID");
        });

        it("Nonexistent application ID returns 404", async () => {
            const recruiter = await createRecruiter();
            const nonExistentId = new mongoose.Types.ObjectId();

            const res = await request(app)
                .put(`/api/applications/${nonExistentId}/status`)
                .set("Authorization", `Bearer ${recruiter.token}`)
                .send({ status: "Under Review" });

            assert.equal(res.status, 404);
            assert.equal(res.body.success, false);
            assert.equal(res.body.message, "Application not found");
        });

        it("Invalid status value returns 400", async () => {
            const recruiter = await createRecruiter();
            const job = await createActiveJob(recruiter.user._id);
            const student = await createStudentWithResume();
            const application = await createApplicationDoc(job._id, student.user._id);

            const res = await request(app)
                .put(`/api/applications/${application._id}/status`)
                .set("Authorization", `Bearer ${recruiter.token}`)
                .send({ status: "Hired" });

            assert.equal(res.status, 400);
            assert.equal(res.body.success, false);

            const dbApp = await Application.findById(application._id);
            assert.equal(dbApp.status, "Applied");
        });

        it("KNOWN ISSUE: deleted job causes null populated-job ownership check crash (BE-09)", async () => {
            const recruiter = await createRecruiter();
            const job = await createActiveJob(recruiter.user._id);
            const student = await createStudentWithResume();
            const application = await createApplicationDoc(job._id, student.user._id);

            // Delete job directly from DB
            await Job.findByIdAndDelete(job._id);

            // Recruiter tries to update status; application.job is null, controller throws TypeError on application.job.createdBy
            const res = await request(app)
                .put(`/api/applications/${application._id}/status`)
                .set("Authorization", `Bearer ${recruiter.token}`)
                .send({ status: "Shortlisted" });

            assert.equal(res.status, 500);
            assert.equal(res.body.success, false);
            assert.equal(res.body.message, "Internal Server Error");

            const dbApp = await Application.findById(application._id);
            assert.equal(dbApp.status, "Applied");
        });
    });
});
