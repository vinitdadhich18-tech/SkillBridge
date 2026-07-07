const multer = require("multer");

// Storage Configuration
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, "uploads/");
    },

    filename: function (req, file, cb) {
        cb(null, Date.now() + "-" + file.originalname);
    }
});

// Resume Upload (PDF only)
const resumeUpload = multer({
    storage,
    fileFilter: (req, file, cb) => {

        if (file.mimetype === "application/pdf") {
            cb(null, true);
        } else {
            cb(new Error("Only PDF files are allowed!"), false);
        }
    },

    limits: {
        fileSize: 2 * 1024 * 1024 // 2 MB
    }
});

// Profile Picture Upload (Images only)
const profileUpload = multer({
    storage,
    fileFilter: (req, file, cb) => {

        const allowedTypes = [
            "image/jpeg",
            "image/jpg",
            "image/png"
        ];

        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error("Only JPG, JPEG and PNG images are allowed!"), false);
        }
    },

    limits: {
        fileSize: 5 * 1024 * 1024 // 5 MB
    }
});

module.exports = {
    resumeUpload,
    profileUpload
};