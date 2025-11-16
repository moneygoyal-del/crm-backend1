import apiResponse from "../utils/apiResponse.utils.js";
import asyncHandler from "../utils/asynchandler.utils.js";
import { process_phone_no } from "../helper/preprocess_data.helper.js";
import { pool } from "../DB/db.js";
import apiError from "../utils/apiError.utils.js";
import { sendWhatsAppMessage } from "../utils/whatsapp.util.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { randomInt } from "crypto";

// (Config and helper function are unchanged)
const OTP_RATE_LIMIT_COUNT = 3;
const OTP_RATE_LIMIT_WINDOW_MINUTES = 15;
const generateOTP = () => {
    return randomInt(100000, 1000000).toString();
};

export default class authController {

    // --- 1. SEND OTP (Updated with Transaction to Invalidate Old OTPs) ---
    sendOtp = asyncHandler(async (req, res) => {
        const { phone } = req.body;
        if (!phone) throw new apiError(400, "Phone number is required");

        const phone_processed = process_phone_no(phone);

        // 1. Check if user exists
        const userResult = await pool.query("SELECT id FROM users WHERE phone = $1", [phone_processed]);
        if (userResult.rows.length === 0) {
            throw new apiError(404, "User Not Found");
        }
        const userId = userResult.rows[0].id;

        // 2. CHECK RATE LIMIT
        const rateLimitResult = await pool.query(
            `SELECT COUNT(*) FROM otps 
             WHERE user_id = $1 AND created_at > NOW() - INTERVAL '${OTP_RATE_LIMIT_WINDOW_MINUTES} minutes'`,
            [userId]
        );
        const otpCount = parseInt(rateLimitResult.rows[0].count, 10);
        if (otpCount >= OTP_RATE_LIMIT_COUNT) {
            throw new apiError(
                429, 
                `Too many OTP requests. Please try again in ${OTP_RATE_LIMIT_WINDOW_MINUTES} minutes.`
            );
        }

        // 3. Generate secure OTP
        const otp = generateOTP();
        const message = `Your Medpho login OTP is: ${otp}. Do not share this with anyone.`;

        // 4. Send OTP via WhatsApp FIRST
        try {
            await sendWhatsAppMessage(phone_processed, message);
        } catch (whatsappError) {
            console.error("WhatsApp API failed:", whatsappError.message);
            throw new apiError(502, "Failed to send OTP. Please check the phone number or try again later.");
        }

        // 5. --- NEW TRANSACTION LOGIC ---
        // Once WhatsApp succeeds, hash the OTP and perform DB operations in a transaction.
        const otp_hash = await bcrypt.hash(otp, 10);
        const expires_at = new Date(Date.now() + 10 * 60 * 1000); // 10-minute expiry

        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            
            // Step 5a: Invalidate all previous, un-used OTPs for this user
            await client.query(
                "UPDATE otps SET is_used = true WHERE user_id = $1 AND is_used = false",
                [userId]
            );

            // Step 5b: Insert the new, valid OTP
            await client.query(
                "INSERT INTO otps (user_id, otp_hash, expires_at) VALUES ($1, $2, $3)",
                [userId, otp_hash, expires_at]
            );

            // Step 5c: Commit the transaction
            await client.query('COMMIT');
        } catch (dbError) {
            // If anything fails, roll back
            await client.query('ROLLBACK');
            throw new apiError(500, "Database error. Could not save OTP.", [], dbError.stack);
        } finally {
            client.release();
        }
        // --- END TRANSACTION LOGIC ---

        res.status(200).json(new apiResponse(200, null, "OTP sent successfully"));
    });

    // --- 2. VERIFY OTP AND LOGIN (Unchanged from previous step) ---
    verifyOtp = asyncHandler(async (req, res) => {
        const { phone, otp } = req.body;
        if (!phone || !otp) throw new apiError(400, "Phone and OTP are required");

        const phone_processed = process_phone_no(phone);

        // 1. Find user
        const userResult = await pool.query(
            "SELECT id, first_name, last_name, phone FROM users WHERE phone = $1",
            [phone_processed]
        );
        if (userResult.rows.length === 0) throw new apiError(404, "User Not Found");
        
        const user = userResult.rows[0];

        // 2. Find a matching, valid OTP for that user
        const otpResult = await pool.query(
            `SELECT id, otp_hash FROM otps 
             WHERE user_id = $1 AND expires_at > NOW() AND is_used = false
             ORDER BY created_at DESC`, // Get the newest (and only valid) OTP
            [user.id]
        );
        
        if (otpResult.rows.length === 0) {
            throw new apiError(401, "Invalid or expired OTP");
        }

        // 3. Check the provided OTP.
        // Since we invalidated old ones, there should only be one valid row.
        // But looping is still safest.
        let isOtpValid = false;
        for (const row of otpResult.rows) {
            const didMatch = await bcrypt.compare(otp, row.otp_hash);
            if (didMatch) {
                isOtpValid = true;
                break; // Found a match
            }
        }
        
        if (!isOtpValid) {
            throw new apiError(401, "Invalid or expired OTP");
        }

        // 4. Delete ALL OTPs for this user for security and cleanup
        await pool.query("DELETE FROM otps WHERE user_id = $1", [user.id]);

        // 5. Create the JWT Payload
        const payload = {
            id: user.id,
            phone: user.phone
        };

        // 6. Sign the JWT with your 3-DAY expiry
        const token = jwt.sign(payload, process.env.JWT_SECRET, {
            expiresIn: process.env.JWT_EXPIRE_IN || '5d'
        });

        // 7. Send back the token and user info
        const userData = {
            id: user.id,
            name: `${user.first_name} ${user.last_name || ''}`.trim()
        };
        
        res.status(200).json(new apiResponse(
            200,
            { token: token, user: userData },
            "Login successful"
        ));
    });
}