import jwt from 'jsonwebtoken';
import { pool } from '../DB/db.js';
import apiError from '../utils/apiError.utils.js';
import asyncHandler from '../utils/asynchandler.utils.js';

export const verifyJWT = asyncHandler(async (req, res, next) => {
    try {
        const token = req.headers["authorization"]?.split(" ")[1]; // Format: "Bearer <token>"

        if (!token) {
            throw new apiError(401, "No token provided. Unauthorized request.");
        }

        const decodedToken = jwt.verify(token, process.env.JWT_SECRET);

       
        const userResult = await pool.query("SELECT id, phone, first_name, role FROM users WHERE id = $1", [decodedToken?.id]);
        
        if (userResult.rows.length === 0) {
            throw new apiError(401, "Invalid token. User not found.");
        }

 
        req.user = userResult.rows[0];
        next();
    } catch (error) {
        if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
            throw new apiError(401, "Invalid or expired token.");
        }
        throw error;
    }
});

export const verifyRole = (allowedRoles) => {
    return (req, res, next) => {
        // Ensure request has a user (verifyJWT must run first) and that the user has a role
        if (!req.user || !req.user.role) {
             return res.status(403).json({ 
                success: false, 
                message: "Access Forbidden: User role is undefined." 
            });
        }

        // Check if the user's role is in the allowed list
        if (!allowedRoles.includes(req.user.role)) {
            return res.status(403).json({ 
                success: false, 
                message: `Access Denied. You do not have permission to access this resource. Required: ${allowedRoles.join(" or ")}` 
            });
        }

        next();
    };
};