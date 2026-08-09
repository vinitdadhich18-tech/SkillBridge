const User = require("../models/User");

const roleMiddleware = (requiredRole) => {
    return async (req, res, next) => {
        try {

            const user = await User.findById(req.user.id);

            if (!user) {
                return res.status(404).json({
                    success: false,
                    message: "User not found"
                });
            }

            if (user.role !== requiredRole) {
                return res.status(403).json({
                    success: false,
                    message: `Access denied. ${requiredRole} access required.`
                });
            }

            next();

        } catch (error) {

            console.error(error);

            return res.status(500).json({
                success: false,
                message: "Internal Server Error"
            });
        }
    };
};

module.exports = roleMiddleware;