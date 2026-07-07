const User = require("../models/User");
const { signupSchema, loginSchema } = require("../validators/authValidator");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const cloudinary = require("../config/cloudinary");
const fs = require("fs");

const signup = async (req, res) => {
    try {
        const validationResult = signupSchema.safeParse(req.body);
        
        if (!validationResult.success) {
            return res.status(400).json({
                success: false,
                message: validationResult.error.issues[0].message
            });
        }
        const { name, email, password } = req.body;

        const existingUser = await User.findOne({ email });

        if (existingUser) {
            return res.status(409).json({
                success: false,
                message: "Email already registered"
            });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const user = await User.create({
            name,
            email,
            password : hashedPassword
        });

        const token = jwt.sign(
            {
                id: user._id
            },
            process.env.JWT_SECRET,
            {
                expiresIn: "7d"
            }
        );

        res.status(201).json({
            success: true,
            message: "User created successfully!",
            token,
            user: {
                id: user._id,
                name: user.name,
                email: user.email
            }
        });

    } catch (error) {
        console.error(error);

        res.status(500).json({
            success: false,
            message: "Internal Server Error"
        });
    }
};

const login = async (req, res) => {
    try {
        const validationResult = loginSchema.safeParse(req.body);

        if (!validationResult.success) {
            return res.status(400).json({
                success: false,
                message: validationResult.error.issues[0].message
            });
        }

        const { email, password } = req.body;

        const user = await User.findOne({ email });

        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found"
            });
        }

        const isMatch = await bcrypt.compare(password, user.password);

        if (!isMatch) {
            return res.status(401).json({
                success: false,
                message: "Invalid Credentials"
            });
        }

        const token = jwt.sign(
            { id: user._id },
            process.env.JWT_SECRET,
            { expiresIn: "7d" }
        );

        return res.status(200).json({
            success: true,
            message: "Login Successful",
            token,
            user: {
                id: user._id,
                name: user.name,
                email: user.email
            }
        });

    } catch (error) {
        console.error(error);

        return res.status(500).json({
            success: false,
            message: "Internal Server Error"
        });
    }
};

const getProfile = async (req, res) => {
    try {

        const user = await User.findById(req.user.id).select("-password");

        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found"
            });
        }

        return res.status(200).json({
            success: true,
            message: "Profile fetched successfully",
            user
        });

    } catch (error) {
        console.error(error);

        return res.status(500).json({
            success: false,
            message: "Internal Server Error"
        });
    }
};

const updateProfile = async (req, res) => {
    try {

        const {
            bio,
            college,
            branch,
            graduationYear,
            github,
            linkedin,
            portfolio,
            skills
        } = req.body;

        const userId = req.user.id;

        const updatedUser = await User.findByIdAndUpdate(
            userId,
            {
                bio,
                college,
                branch,
                graduationYear,
                github,
                linkedin,
                portfolio,
                skills
            },
            {
                new: true,
                runValidators: true
            }
        ).select("-password");

        return res.status(200).json({
            success: true,
            message: "Profile updated successfully",
            user: updatedUser
        });

    } catch (error) {
        console.error(error);

        return res.status(500).json({
            success: false,
            message: "Internal Server Error"
        });
    }
};

const uploadResume = async (req, res) => {
    try {

        // Check if a file is uploaded
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: "Please upload a PDF resume"
            });
        }

        // Find logged-in user
        const user = await User.findById(req.user.id);

        if (!user) {

            if (fs.existsSync(req.file.path)) {
                fs.unlinkSync(req.file.path);
            }

            return res.status(404).json({
                success: false,
                message: "User not found"
            });
        }

        // Delete old resume from Cloudinary (if it exists)
        if (user.resume && user.resume.public_id) {

            await cloudinary.uploader.destroy(
                user.resume.public_id,
                {
                    resource_type: "raw"
                }
            );
        }

        // Upload new resume
        const result = await cloudinary.uploader.upload(
            req.file.path,
            {
                resource_type: "raw",
                folder: "SkillBridge/Resumes"
            }
        );

        // Delete temporary local file
        if (fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }

        // Save new resume details
        user.resume = {
            url: result.secure_url,
            public_id: result.public_id
        };

        await user.save();

        // Get updated user
        const updatedUser = await User.findById(req.user.id).select("-password");

        return res.status(200).json({
            success: true,
            message: "Resume uploaded successfully",
            user: updatedUser
        });

    } catch (error) {

        // Delete temporary local file if an error occurs
        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }

        console.error(error);

        return res.status(500).json({
            success: false,
            message: "Internal Server Error"
        });
    }
};

const uploadProfilePicture = async (req, res) => {
    try {

        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: "Please upload a profile picture"
            });
        }

        const user = await User.findById(req.user.id);

        if (!user) {

            if (fs.existsSync(req.file.path)) {
                fs.unlinkSync(req.file.path);
            }

            return res.status(404).json({
                success: false,
                message: "User not found"
            });
        }

        // Delete old profile picture from Cloudinary
        if (user.profilePicture && user.profilePicture.public_id) {

            await cloudinary.uploader.destroy(
                user.profilePicture.public_id
            );
        }

        // Upload new profile picture
        const result = await cloudinary.uploader.upload(
            req.file.path,
            {
                folder: "SkillBridge/ProfilePictures"
            }
        );

        // Delete temporary local file
        if (fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }

        // Save image details
        user.profilePicture = {
            url: result.secure_url,
            public_id: result.public_id
        };

        await user.save();

        const updatedUser = await User.findById(req.user.id)
            .select("-password");

        return res.status(200).json({
            success: true,
            message: "Profile picture uploaded successfully",
            user: updatedUser
        });

    } catch (error) {

        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }

        console.error(error);

        return res.status(500).json({
            success: false,
            message: "Internal Server Error"
        });
    }
};

module.exports = {
    signup,
    login,
    getProfile,
    updateProfile,
    uploadResume,
    uploadProfilePicture
};