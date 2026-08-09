const mongoose = require("mongoose");

const applicationSchema = new mongoose.Schema({

    job: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Job",
        required: true
    },

    applicant: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true
    },

    resumeUrl: {
        type: String,
        required: true
    },

    resumePublicId: {
        type: String,
        default: ""
    },

    coverLetter: {
        type: String,
        trim: true,
        maxlength: 2000,
        default: ""
    },

    status: {
        type: String,
        enum: [
            "Applied",
            "Under Review",
            "Shortlisted",
            "Rejected",
            "Accepted"
        ],
        default: "Applied"
    }

}, {
    timestamps: true
});


// A student can apply to a particular job only once
applicationSchema.index(
    {
        job: 1,
        applicant: 1
    },
    {
        unique: true
    }
);

module.exports = mongoose.model("Application", applicationSchema);