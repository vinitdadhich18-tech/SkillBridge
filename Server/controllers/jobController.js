const Job = require("../models/Job");

const {
    createJobSchema,
    updateJobSchema
} = require("../validators/jobValidator");


// =========================
// CREATE JOB
// =========================

const createJob = async (req, res) => {
    try {

        const validationResult = createJobSchema.safeParse(req.body);

        if (!validationResult.success) {
            return res.status(400).json({
                success: false,
                message: validationResult.error.issues[0].message
            });
        }

        const {
            title,
            company,
            location,
            jobType,
            salary,
            description,
            requirements,
            skillsRequired,
            experienceLevel,
            deadline
        } = validationResult.data;

        const job = await Job.create({
            title,
            company,
            location,
            jobType,
            salary,
            description,
            requirements,
            skillsRequired,
            experienceLevel,
            deadline,
            createdBy: req.user.id
        });

        return res.status(201).json({
            success: true,
            message: "Job created successfully",
            job
        });

    } catch (error) {

        console.error(error);

        return res.status(500).json({
            success: false,
            message: "Internal Server Error"
        });
    }
};


// =========================
// GET ALL JOBS
// =========================

const getAllJobs = async (req, res) => {
    try {

        const jobs = await Job.find()
            .populate("createdBy", "name email")
            .sort({ createdAt: -1 });

        return res.status(200).json({
            success: true,
            count: jobs.length,
            jobs
        });

    } catch (error) {

        console.error(error);

        return res.status(500).json({
            success: false,
            message: "Internal Server Error"
        });
    }
};


// =========================
// GET JOB BY ID
// =========================

const getJobById = async (req, res) => {
    try {

        const job = await Job.findById(req.params.id)
            .populate("createdBy", "name email");

        if (!job) {
            return res.status(404).json({
                success: false,
                message: "Job not found"
            });
        }

        return res.status(200).json({
            success: true,
            job
        });

    } catch (error) {

        console.error(error);

        return res.status(500).json({
            success: false,
            message: "Internal Server Error"
        });
    }
};


// =========================
// UPDATE JOB
// =========================

const updateJob = async (req, res) => {
    try {

        const validationResult = updateJobSchema.safeParse(req.body);

        if (!validationResult.success) {
            return res.status(400).json({
                success: false,
                message: validationResult.error.issues[0].message
            });
        }

        const job = await Job.findById(req.params.id);

        if (!job) {
            return res.status(404).json({
                success: false,
                message: "Job not found"
            });
        }

        // Only the user who created the job can update it
        if (job.createdBy.toString() !== req.user.id) {
            return res.status(403).json({
                success: false,
                message: "You are not authorized to update this job"
            });
        }

        const updatedJob = await Job.findByIdAndUpdate(
            req.params.id,
            validationResult.data,
            {
                new: true,
                runValidators: true
            }
        ).populate("createdBy", "name email");

        return res.status(200).json({
            success: true,
            message: "Job updated successfully",
            job: updatedJob
        });

    } catch (error) {

        console.error(error);

        return res.status(500).json({
            success: false,
            message: "Internal Server Error"
        });
    }
};


// =========================
// DELETE JOB
// =========================

const deleteJob = async (req, res) => {
    try {

        const job = await Job.findById(req.params.id);

        if (!job) {
            return res.status(404).json({
                success: false,
                message: "Job not found"
            });
        }

        // Only the user who created the job can delete it
        if (job.createdBy.toString() !== req.user.id) {
            return res.status(403).json({
                success: false,
                message: "You are not authorized to delete this job"
            });
        }

        await Job.findByIdAndDelete(req.params.id);

        return res.status(200).json({
            success: true,
            message: "Job deleted successfully"
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
    createJob,
    getAllJobs,
    getJobById,
    updateJob,
    deleteJob
};