const mongoose = require("mongoose");

const jobSchema = new mongoose.Schema({

    title: {
        type: String,
        required: true,
        trim: true
    },

    company: {
        type: String,
        required: true,
        trim: true
    },

    location: {
        type: String,
        required: true,
        trim: true
    },

    jobType: {
        type: String,
        enum: [
            "Full-Time",
            "Part-Time",
            "Internship",
            "Contract",
            "Remote"
        ],
        required: true
    },

    salary: {
        type: String,
        required: true,
        trim: true
    },

    description: {
        type: String,
        required: true,
        trim: true
    },

    requirements: [{
        type: String,
        trim: true
    }],

    skillsRequired: [{
        type: String,
        trim: true
    }],

    experienceLevel: {
        type: String,
        enum: [
            "Fresher",
            "0-1 Years",
            "1-3 Years",
            "3+ Years"
        ],
        required: true
    },

    deadline: {
        type: Date,
        required: true
    },

    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true
    }

}, {
    timestamps: true
});

module.exports = mongoose.model("Job", jobSchema);