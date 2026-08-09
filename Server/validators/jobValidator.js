const { z } = require("zod");

const createJobSchema = z.object({
    title: z
        .string()
        .trim()
        .min(3, "Job title must be at least 3 characters"),

    company: z
        .string()
        .trim()
        .min(2, "Company name is required"),

    location: z
        .string()
        .trim()
        .min(2, "Location is required"),

    jobType: z.enum(
        ["Full-Time", "Part-Time", "Internship", "Contract", "Remote"],
        {
            errorMap: () => ({ message: "Invalid job type" })
        }
    ),

    salary: z
        .string()
        .trim()
        .min(1, "Salary is required"),

    description: z
        .string()
        .trim()
        .min(20, "Description must be at least 20 characters"),

    requirements: z
        .array(z.string().trim())
        .optional(),

    skillsRequired: z
        .array(z.string().trim())
        .optional(),

    experienceLevel: z.enum(
        ["Fresher", "0-1 Years", "1-3 Years", "3+ Years"],
        {
            errorMap: () => ({ message: "Invalid experience level" })
        }
    ),

    deadline: z.string().datetime("Invalid deadline date")
});

const updateJobSchema = createJobSchema.partial();

module.exports = {
    createJobSchema,
    updateJobSchema
};