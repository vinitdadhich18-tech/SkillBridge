const mongoose = require("mongoose");
const Application = require("../models/Application");
const Job = require("../models/Job");
const User = require("../models/User");

const {
    createApplicationSchema,
    updateApplicationStatusSchema
} = require("../validators/applicationValidator");


// ==========================================
// APPLY FOR A JOB
// ==========================================

const applyForJob = async (req, res) => {
    try {

        const { jobId } = req.params;

        if (!mongoose.Types.ObjectId.isValid(jobId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid job ID"
            });
        }

        // Validate request body
        const validationResult = createApplicationSchema.safeParse(req.body);

        if (!validationResult.success) {
            return res.status(400).json({
                success: false,
                message: validationResult.error.issues[0].message
            });
        }

        const { coverLetter } = validationResult.data;

        // Find the job
        const job = await Job.findById(jobId);

        if (!job) {
            return res.status(404).json({
                success: false,
                message: "Job not found"
            });
        }

        // Check deadline
        if (new Date(job.deadline) < new Date()) {
            return res.status(400).json({
                success: false,
                message: "Application deadline has passed"
            });
        }

        // Find applicant
        const user = await User.findById(req.user.id);

        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found"
            });
        }

        // User must have a resume
        if (!user.resume || !user.resume.url) {
            return res.status(400).json({
                success: false,
                message: "Please upload your resume before applying"
            });
        }

        // Prevent recruiter from applying to jobs
        if (user.role !== "student") {
            return res.status(403).json({
                success: false,
                message: "Only students can apply for jobs"
            });
        }

        // Prevent applying to the same job twice
        const existingApplication = await Application.findOne({
            job: job._id,
            applicant: user._id
        });

        if (existingApplication) {
            return res.status(409).json({
                success: false,
                message: "You have already applied for this job"
            });
        }

        // Create application
        const application = await Application.create({
            job: job._id,
            applicant: user._id,
            resumeUrl: user.resume.url,
            resumePublicId: user.resume.public_id,
            coverLetter
        });

        // Return populated application
        const populatedApplication = await Application.findById(
            application._id
        )
            .populate("job", "title company location jobType")
            .populate("applicant", "name email skills");

        return res.status(201).json({
            success: true,
            message: "Application submitted successfully",
            application: populatedApplication
        });

    } catch (error) {

        console.error(error);

        return res.status(500).json({
            success: false,
            message: "Internal Server Error"
        });
    }
};


// ==========================================
// GET MY APPLICATIONS
// ==========================================

const getMyApplications = async (req, res) => {
    try {

        const applications = await Application.find({
            applicant: req.user.id
        })
            .populate(
                "job",
                "title company location jobType salary deadline"
            )
            .sort({ createdAt: -1 });

        return res.status(200).json({
            success: true,
            count: applications.length,
            applications
        });

    } catch (error) {

        console.error(error);

        return res.status(500).json({
            success: false,
            message: "Internal Server Error"
        });
    }
};


// ==========================================
// GET APPLICATIONS FOR A JOB
// ==========================================

const getJobApplications = async (req, res) => {
    try {

        const { jobId } = req.params;

        if (!mongoose.Types.ObjectId.isValid(jobId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid job ID"
            });
        }

        const job = await Job.findById(jobId);

        if (!job) {
            return res.status(404).json({
                success: false,
                message: "Job not found"
            });
        }

        // Only the recruiter who created the job can see applications
        if (job.createdBy.toString() !== req.user.id) {
            return res.status(403).json({
                success: false,
                message: "You are not authorized to view these applications"
            });
        }

        const applications = await Application.find({
            job: job._id
        })
            .populate(
                "applicant",
                "name email skills college branch graduationYear profilePicture"
            )
            .sort({ createdAt: -1 });

        return res.status(200).json({
            success: true,
            count: applications.length,
            applications
        });

    } catch (error) {

        console.error(error);

        return res.status(500).json({
            success: false,
            message: "Internal Server Error"
        });
    }
};


// ==========================================
// UPDATE APPLICATION STATUS
// ==========================================

const updateApplicationStatus = async (req, res) => {
    try {

        const { id } = req.params;

        // Check if application ID is a valid MongoDB ObjectId
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid application ID"
            });
        }

        const validationResult =
            updateApplicationStatusSchema.safeParse(req.body);

        if (!validationResult.success) {
            return res.status(400).json({
                success: false,
                message: validationResult.error.issues[0].message
            });
        }

        const { status } = validationResult.data;

        const application = await Application.findById(id)
            .populate("job", "createdBy title company");

        if (!application) {
            return res.status(404).json({
                success: false,
                message: "Application not found"
            });
        }

        // Only the recruiter who owns the job can update status
        if (
            application.job.createdBy.toString() !==
            req.user.id
        ) {
            return res.status(403).json({
                success: false,
                message: "You are not authorized to update this application"
            });
        }

        application.status = status;

        await application.save();

        const updatedApplication =
            await Application.findById(application._id)
                .populate(
                    "job",
                    "title company location jobType"
                )
                .populate(
                    "applicant",
                    "name email skills"
                );

        return res.status(200).json({
            success: true,
            message: "Application status updated successfully",
            application: updatedApplication
        });

    } catch (error) {

        console.error(error);

        return res.status(500).json({
            success: false,
            message: "Internal Server Error"
        });
    }
};


module.exports = {
    applyForJob,
    getMyApplications,
    getJobApplications,
    updateApplicationStatus
};