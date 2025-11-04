import apiResponse from "../utils/apiResponse.utils.js";
import asyncHandler from "../utils/asynchandler.utils.js";
import { process_phone_no } from "../helper/preprocess_data.helper.js";
import { pool } from "../DB/db.js";
import apiError from "../utils/apiError.utils.js";
import { sendWhatsAppMessage } from "../utils/whatsapp.util.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

// Helper function to generate a 6-digit OTP
const generateOTP = () => {
    return Math.floor(100000 + Math.random() * 900000).toString();
};

export default class authController {

    // --- 1. SEND OTP ---
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

        // 2. Generate OTP
        const otp = generateOTP();
        const message = `Your Medpho login OTP is: ${otp}. Do not share this with anyone.`;

        // 3. Send OTP via WhatsApp FIRST
        try {
            await sendWhatsAppMessage(phone_processed, message);
        } catch (whatsappError) {
            console.error("WhatsApp API failed:", whatsappError.message);
            // Throw a user-friendly error instead of a generic 500
            throw new apiError(502, "Failed to send OTP. Please check the phone number or try again later.");
        }

        // 4. ONLY if WhatsApp send was successful, store the OTP hash
        const otp_hash = await bcrypt.hash(otp, 10);
        const expires_at = new Date(Date.now() + 10 * 60 * 1000); // 10-minute expiry

        await pool.query(
            "INSERT INTO otps (user_id, otp_hash, expires_at) VALUES ($1, $2, $3)",
            [userId, otp_hash, expires_at]
        );

        res.status(200).json(new apiResponse(200, null, "OTP sent successfully"));
    });

    // --- 2. VERIFY OTP AND LOGIN (to create JWT) ---
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
             ORDER BY created_at DESC`, // Get the newest OTP
            [user.id]
        );
        
        if (otpResult.rows.length === 0) {
            throw new apiError(401, "Invalid or expired OTP");
        }

        // 3. Check the provided OTP against all valid hashes
        let validOtpId = null;
        for (const row of otpResult.rows) {
            const isOtpValid = await bcrypt.compare(otp, row.otp_hash);
            if (isOtpValid) {
                validOtpId = row.id;
                break; // Found a match
            }
        }
        
        if (!validOtpId) {
            throw new apiError(401, "Invalid or expired OTP");
        }

        // 4. Mark the OTP as used
        await pool.query("UPDATE otps SET is_used = true WHERE id = $1", [validOtpId]);

        // 5. Create the JWT Payload
        const payload = {
            id: user.id,
            phone: user.phone
        };

        // 6. Sign the JWT with your 3-DAY expiry
        const token = jwt.sign(payload, process.env.JWT_SECRET, {
            expiresIn: process.env.JWT_EXPIRE_IN || '3d'
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