const z = require("zod");

const signupSchema = z.object({

    name: z
        .string()
        .min(3, "Name must contain at least 3 characters"),

    email: z
        .string()
        .email("Invalid Email"),

    password: z
        .string()
        .min(8, "Password must be at least 8 characters")

});

const loginSchema = z.object({
    email: z
        .string()
        .email("Invalid email address"),

    password: z
        .string()
        .min(8, "Password must be at least 8 characters")
});

module.exports = {
    signupSchema,
    loginSchema
};