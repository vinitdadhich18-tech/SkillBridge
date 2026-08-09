const express = require("express");

const router = express.Router();

const authMiddleware = require("../middleware/authMiddleware");
const roleMiddleware = require("../middleware/roleMiddleware");

const {
    applyForJob,
    getMyApplications,
    getJobApplications,
    updateApplicationStatus
} = require("../controllers/applicationController");


// ==========================================
// STUDENT ROUTES
// ==========================================

// Apply for a job
router.post(
    "/job/:jobId",
    authMiddleware,
    roleMiddleware("student"),
    applyForJob
);


// Get logged-in student's applications
router.get(
    "/my",
    authMiddleware,
    roleMiddleware("student"),
    getMyApplications
);


// ==========================================
// RECRUITER ROUTES
// ==========================================

// Get applications for recruiter's job
router.get(
    "/job/:jobId",
    authMiddleware,
    roleMiddleware("recruiter"),
    getJobApplications
);


// Update application status
router.put(
    "/:id/status",
    authMiddleware,
    roleMiddleware("recruiter"),
    updateApplicationStatus
);


module.exports = router;