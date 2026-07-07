const express = require("express");
const router = express.Router();

const {
    signup,
    login,
    getProfile,
    updateProfile,
    uploadResume,
    uploadProfilePicture
} = require("../controllers/authController");

const authMiddleware = require("../middleware/authMiddleware");

const {
    resumeUpload,
    profileUpload
} = require("../middleware/uploadMiddleware");

// Public Routes
router.post("/signup", signup);
router.post("/login", login);

// Protected Routes
router.get("/profile", authMiddleware, getProfile);

router.put("/profile", authMiddleware, updateProfile);

router.put(
    "/upload-resume",
    authMiddleware,
    resumeUpload.single("resume"),
    uploadResume
);

router.put(
    "/upload-profile-picture",
    authMiddleware,
    profileUpload.single("profilePicture"),
    uploadProfilePicture
);

module.exports = router;