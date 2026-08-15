const express = require("express");

const router = express.Router();

const authMiddleware = require("../middleware/authMiddleware");
const roleMiddleware = require("../middleware/roleMiddleware");

const {
    createJob,
    getAllJobs,
    getJobById,
    getRecommendedJobs,
    updateJob,
    deleteJob
} = require("../controllers/jobController");


// Recruiter only
router.post(
    "/",
    authMiddleware,
    roleMiddleware("recruiter"),
    createJob
);

// Public routes
router.get("/", getAllJobs);

router.get(
    "/recommended",
    authMiddleware,
    roleMiddleware("student"),
    getRecommendedJobs
);

router.get("/:id", getJobById);

// Recruiter only
router.put(
    "/:id",
    authMiddleware,
    roleMiddleware("recruiter"),
    updateJob
);

router.delete(
    "/:id",
    authMiddleware,
    roleMiddleware("recruiter"),
    deleteJob
);

module.exports = router;