const { z } = require("zod");

const createApplicationSchema = z.object({

    coverLetter: z
        .string()
        .trim()
        .max(2000, "Cover letter cannot exceed 2000 characters")
        .optional()
        .default("")

});


const updateApplicationStatusSchema = z.object({

    status: z.enum(
        [
            "Applied",
            "Under Review",
            "Shortlisted",
            "Rejected",
            "Accepted"
        ],
        {
            errorMap: () => ({
                message: "Invalid application status"
            })
        }
    )

});


module.exports = {
    createApplicationSchema,
    updateApplicationStatusSchema
};