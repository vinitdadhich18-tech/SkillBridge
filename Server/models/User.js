const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
    name : {
        type : String,
        required : true,
        trim : true,
    },

    email : {
        type : String,
        required : true,
        unique: true,
        lowercase: true,
    },

    password : {
        type : String,
        required : true,
    },

    skills : [{
        type : String
    }],

    profilePicture: {
        type: String,
        default: ""
    },

    resume: {
        type: String,
        default: ""
    },

    bio: {
    type: String,
    default: ""
    },

    college: {
        type: String,
        default: ""
    },

    branch: {
        type: String,
        default: ""
    },

    graduationYear: {
        type: Number
    },

    github: {
        type: String,
        default: ""
    },

    linkedin: {
        type: String,
        default: ""
    },

    portfolio: {
        type: String,
        default: ""
    },
}, {
    timestamps : true
});

module.exports = mongoose.model("User", userSchema);