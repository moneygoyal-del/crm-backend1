import apiResponse from "../utils/apiResponse.utils.js";
import asyncHandler from "../utils/asynchandler.utils.js";
import { process_phone_no, getIndianTimeISO } from "../helper/preprocess_data.helper.js";
import { pool } from "../DB/db.js";
import apiError from "../utils/apiError.utils.js";
import { sendWhatsAppMessage } from "../utils/whatsapp.util.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { randomInt, randomBytes } from "crypto";
import { logAudit } from "../utils/auditLogger.util.js";

const OTP_RATE_LIMIT_COUNT = 3;
const OTP_RATE_LIMIT_WINDOW_MINUTES = 15;
const generateOTP = () => {
    return randomInt(100000, 1000000).toString();
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

        // 5. Transaction Logic
        const otp_hash = await bcrypt.hash(otp, 10);
        
       
        const expires_at = getIndianTimeISO(10); 

        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            // Invalidate old OTPs
            await client.query("UPDATE otps SET is_used = true WHERE user_id = $1 AND is_used = false", [userId]);
            // Insert new OTP
            await client.query("INSERT INTO otps (user_id, otp_hash, expires_at) VALUES ($1, $2, $3)", [userId, otp_hash, expires_at]);
            await client.query('COMMIT');
        } catch (dbError) {
            await client.query('ROLLBACK');
            throw new apiError(500, "Database error. Could not save OTP.", [], dbError.stack);
        } finally {
            client.release();
        }

        res.status(200).json(new apiResponse(200, null, "OTP sent successfully"));
    });

    // --- 2. VERIFY OTP AND LOGIN ---
    verifyOtp = asyncHandler(async (req, res) => {
        const { phone, otp } = req.body;
        if (!phone || !otp) throw new apiError(400, "Phone and OTP are required");

        const phone_processed = process_phone_no(phone);

    
        const userResult = await pool.query(
            "SELECT id, first_name, last_name, phone, role FROM users WHERE phone = $1",
            [phone_processed]
        );
        if (userResult.rows.length === 0) throw new apiError(404, "User Not Found");
        
        const user = userResult.rows[0];

        // 2. Find a matching, valid OTP for that user
        const currentIST = getIndianTimeISO();
        
        const otpResult = await pool.query(
            `SELECT id, otp_hash FROM otps 
             WHERE user_id = $1 AND expires_at > $2 AND is_used = false
             ORDER BY created_at DESC`, 
            [user.id, currentIST]
        );
        
        if (otpResult.rows.length === 0) {
            throw new apiError(401, "Invalid or expired OTP");
        }

        // 3. Check the provided OTP
        let isOtpValid = false;
        for (const row of otpResult.rows) {
            const didMatch = await bcrypt.compare(otp, row.otp_hash);
            if (didMatch) {
                isOtpValid = true;
                break; 
            }
        }
        
        if (!isOtpValid) {
            await logAudit(user.id, 'LOGIN_FAILED', 'auth', null, { reason: 'Invalid OTP provided' });
            throw new apiError(401, "Invalid or expired OTP");
        }

        // 4. Cleanup & Update Login Time
        const loginTime = getIndianTimeISO();
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            await client.query("UPDATE crm.users SET last_login = $1 WHERE id = $2", [loginTime, user.id]);
            await client.query("DELETE FROM crm.otps WHERE user_id = $1", [user.id]);
            await client.query('COMMIT');
        } catch (e) {
            await client.query('ROLLBACK');
            throw e; 
        } finally {
            client.release();
        }

        // 5. Create Tokens (INCLUDE ROLE IN PAYLOAD)
        const accessTokenPayload = { id: user.id, phone: user.phone, role: user.role };
        const accessTokenExpiresIn = '15m'; 
        const accessToken = jwt.sign(accessTokenPayload, process.env.JWT_SECRET, { expiresIn: accessTokenExpiresIn });
        const accessTokenExpiresAt = Date.now() + (15 * 60 * 1000); 

        // --- Refresh Token ---
        const refreshToken = randomBytes(64).toString('hex');
        // 7 days in minutes = 10080
        const refreshTokenExpiresAt = getIndianTimeISO(10080); 
        const refreshTokenHash = await bcrypt.hash(refreshToken, 10);

        await pool.query(
            `INSERT INTO crm.user_refresh_tokens (user_id, token_hash, expires_at, created_at) 
             VALUES ($1, $2, $3, $4)`,
            [user.id, refreshTokenHash, refreshTokenExpiresAt, loginTime]
        );

        // Include role in response so Frontend can use it
        const userData = {
            id: user.id,
            name: `${user.first_name} ${user.last_name || ''}`.trim(),
            role: user.role
        };

        await logAudit(user.id, 'LOGIN_SUCCESS', 'auth', null, { ip: req.ip });
        
        res.status(200).json(new apiResponse(
            200,
            { 
                user: userData,
                accessToken: accessToken,
                accessTokenExpiresAt: accessTokenExpiresAt,
                refreshToken: refreshToken 
            },
            "Login successful"
        ));
    });

    // --- 3. REFRESH TOKEN ---
    handleRefreshToken = asyncHandler(async (req, res) => {
        const { refreshToken } = req.body;
        if (!refreshToken) throw new apiError(400, "Refresh token is required");

        const oldAccessToken = req.headers["authorization"]?.split(" ")[1];
        if (!oldAccessToken) throw new apiError(401, "Old access token is required");

        const decodedOldToken = jwt.decode(oldAccessToken);
        const userId = decodedOldToken?.id;
        if (!userId) throw new apiError(401, "Invalid old access token");

        const currentIST = getIndianTimeISO();
        
        const tokenResult = await pool.query(
            "SELECT id, token_hash FROM crm.user_refresh_tokens WHERE user_id = $1 AND expires_at > $2",
            [userId, currentIST]
        );

        if (tokenResult.rows.length === 0) throw new apiError(401, "No valid refresh tokens found. Please log in again.");

        let foundTokenDbId = null;
        for (const row of tokenResult.rows) {
            const didMatch = await bcrypt.compare(refreshToken, row.token_hash);
            if (didMatch) {
                foundTokenDbId = row.id;
                break;
            }
        }

        if (!foundTokenDbId) throw new apiError(401, "Invalid refresh token. Please log in again.");

        // Rotate Token
        await pool.query("DELETE FROM crm.user_refresh_tokens WHERE id = $1", [foundTokenDbId]);

        // FETCH ROLE AGAIN to ensure fresh permissions
        const userResult = await pool.query("SELECT id, phone, first_name, role FROM crm.users WHERE id = $1", [userId]);
        const user = userResult.rows[0];
        
        // Include role in new Access Token
        const accessTokenPayload = { id: user.id, phone: user.phone, role: user.role };
        const accessTokenExpiresIn = '15m';
        const accessToken = jwt.sign(accessTokenPayload, process.env.JWT_SECRET, { expiresIn: accessTokenExpiresIn });
        const accessTokenExpiresAt = Date.now() + (15 * 60 * 1000);

        const newRefreshToken = randomBytes(64).toString('hex');
        const newRefreshTokenExpiresAt = getIndianTimeISO(10080); // 7 days IST
        const newRefreshTokenHash = await bcrypt.hash(newRefreshToken, 10);
        const createdTime = getIndianTimeISO();
        
        await pool.query(
            "INSERT INTO crm.user_refresh_tokens (user_id, token_hash, expires_at, created_at) VALUES ($1, $2, $3, $4)",
            [user.id, newRefreshTokenHash, newRefreshTokenExpiresAt, createdTime]
        );

        res.status(200).json(new apiResponse(
            200,
            {
                accessToken: accessToken,
                accessTokenExpiresAt: accessTokenExpiresAt,
                refreshToken: newRefreshToken
            },
            "Token refreshed successfully"
        ));
    });
}