const mongoose = require("mongoose");
const Job = require("../models/Job");

const {
    createJobSchema,
    updateJobSchema
} = require("../validators/jobValidator");

const calculateSkillMatch = require("../utils/skillMatcher");

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

        const {
            search,
            location,
            jobType,
            experienceLevel,
            page = 1,
            limit = 10
        } = req.query;


        // Convert pagination values to numbers
        const pageNumber = Math.max(parseInt(page) || 1, 1);
        const limitNumber = Math.min(
            Math.max(parseInt(limit) || 10, 1),
            50
        );


        // Calculate how many documents to skip
        const skip = (pageNumber - 1) * limitNumber;


        // Build dynamic filter
        const filter = {};


        // Search by title, company or description
        if (search) {
            filter.$or = [
                {
                    title: {
                        $regex: search,
                        $options: "i"
                    }
                },
                {
                    company: {
                        $regex: search,
                        $options: "i"
                    }
                },
                {
                    description: {
                        $regex: search,
                        $options: "i"
                    }
                }
            ];
        }


        // Location filter
        if (location) {
            filter.location = {
                $regex: location,
                $options: "i"
            };
        }


        // Job type filter
        if (jobType) {
            filter.jobType = jobType;
        }


        // Experience level filter
        if (experienceLevel) {
            filter.experienceLevel = experienceLevel;
        }


        // Get total number of matching jobs
        const totalJobs = await Job.countDocuments(filter);


        // Get paginated jobs
        const jobs = await Job.find(filter)
            .populate("createdBy", "name email")
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limitNumber);


        const totalPages = Math.ceil(totalJobs / limitNumber);


        return res.status(200).json({
            success: true,

            count: jobs.length,

            pagination: {
                currentPage: pageNumber,
                limit: limitNumber,
                totalJobs,
                totalPages,
                hasNextPage: pageNumber < totalPages,
                hasPreviousPage: pageNumber > 1
            },

            filters: {
                search: search || null,
                location: location || null,
                jobType: jobType || null,
                experienceLevel: experienceLevel || null
            },

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

        const { id } = req.params;

        // Check if the ID is a valid MongoDB ObjectId
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid job ID"
            });
        }

        const job = await Job.findById(id)
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
// GET Recommended JOB
// =========================


const getRecommendedJobs = async (req, res) => {
    try {

        const User = require("../models/User");

        const user = await User.findById(req.user.id)
            .select("skills");

        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found"
            });
        }

        if (!user.skills || user.skills.length === 0) {
            return res.status(400).json({
                success: false,
                message: "Please add your skills to get job recommendations"
            });
        }

        const jobs = await Job.find()
            .populate("createdBy", "name email")
            .sort({ createdAt: -1 });

        const recommendedJobs = jobs
            .map(job => {

                const matchPercentage = calculateSkillMatch(
                    user.skills,
                    job.skillsRequired
                );

                return {
                    ...job.toObject(),
                    matchPercentage
                };
            })
            .filter(job => job.matchPercentage > 0)
            .sort((a, b) =>
                b.matchPercentage - a.matchPercentage
            );

        return res.status(200).json({
            success: true,
            count: recommendedJobs.length,
            userSkills: user.skills,
            jobs: recommendedJobs
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

        // Validate request body
        const validationResult = updateJobSchema.safeParse(req.body);

        if (!validationResult.success) {
            return res.status(400).json({
                success: false,
                message: validationResult.error.issues[0].message
            });
        }

        // Find the job
        const job = await Job.findById(req.params.id);

        if (!job) {
            return res.status(404).json({
                success: false,
                message: "Job not found"
            });
        }

        // Check ownership
        if (job.createdBy.toString() !== req.user.id) {
            return res.status(403).json({
                success: false,
                message: "You are not authorized to update this job"
            });
        }

        // Update only validated fields
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

        // Find the job
        const job = await Job.findById(req.params.id);

        if (!job) {
            return res.status(404).json({
                success: false,
                message: "Job not found"
            });
        }

        // Check ownership
        if (job.createdBy.toString() !== req.user.id) {
            return res.status(403).json({
                success: false,
                message: "You are not authorized to delete this job"
            });
        }

        // Delete job
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
    getRecommendedJobs,
    updateJob,
    deleteJob
};