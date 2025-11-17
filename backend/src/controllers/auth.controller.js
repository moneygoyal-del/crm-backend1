import apiResponse from "../utils/apiResponse.utils.js";
import asyncHandler from "../utils/asynchandler.utils.js";
import { process_phone_no } from "../helper/preprocess_data.helper.js";
import { pool } from "../DB/db.js";
import apiError from "../utils/apiError.utils.js";
import { sendWhatsAppMessage } from "../utils/whatsapp.util.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { randomInt,randomBytes } from "crypto";
import { logAudit } from "../utils/auditLogger.util.js";

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

    // --- 2. VERIFY OTP AND LOGIN 
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
            await logAudit(
                user.id, 
                'LOGIN_FAILED', 
                'auth', 
                null, 
                { reason: 'Invalid OTP provided' }
            );
            throw new apiError(401, "Invalid or expired OTP");
        }

        // 4. Delete ALL OTPs for this user for security and cleanup
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            // Update the user's last_login timestamp
            await client.query("UPDATE crm.users SET last_login = NOW() WHERE id = $1", [user.id]);
            // Delete all OTPs for this user
            await client.query("DELETE FROM crm.otps WHERE user_id = $1", [user.id]);
            await client.query('COMMIT');
        } catch (e) {
            await client.query('ROLLBACK');
            throw e; // Let asyncHandler catch it
        } finally {
            client.release();
        }

        // 5. Create the JWT Payload
        const accessTokenPayload = {
            id: user.id,
            phone: user.phone
        };
        const accessTokenExpiresIn = '15m'; // <-- SHORT! 15 minutes
        const accessToken = jwt.sign(
            accessTokenPayload, 
            process.env.JWT_SECRET, 
            { expiresIn: accessTokenExpiresIn }
        );
        // Calculate the *exact* expiry time to send to the frontend
        const accessTokenExpiresAt = Date.now() + (15 * 60 * 1000);

       
       
        
        // --- 6. CREATE REFRESH TOKEN (Long-lived & Stored) ---
        const refreshToken = randomBytes(64).toString('hex');
        const refreshTokenExpiresInDays = 7;
        const refreshTokenExpiresAt = new Date(Date.now() + (refreshTokenExpiresInDays * 24 * 60 * 60 * 1000));
        const refreshTokenHash = await bcrypt.hash(refreshToken, 10);

        // Store the HASH in the database, not the token itself
        await pool.query(
            `INSERT INTO crm.user_refresh_tokens (user_id, token_hash, expires_at) 
             VALUES ($1, $2, $3)`,
            [user.id, refreshTokenHash, refreshTokenExpiresAt]
        );

        // --- 7. Send back BOTH tokens and user info ---
        const userData = {
            id: user.id,
            name: `${user.first_name} ${user.last_name || ''}`.trim()
        };

        await logAudit(
            user.id,
            'LOGIN_SUCCESS',
            'auth',
            null,
            { ip: req.ip } 
        );
        
        res.status(200).json(new apiResponse(
            200,
            { 
                user: userData,
                accessToken: accessToken,
                accessTokenExpiresAt: accessTokenExpiresAt, // For Approach 1-style proactive check
                refreshToken: refreshToken // <-- Send the *raw* token to the client
            },
            "Login successful"
        ));
    
    });
    handleRefreshToken = asyncHandler(async (req, res) => {
        const { refreshToken } = req.body;
        if (!refreshToken) throw new apiError(400, "Refresh token is required");

        // 1. Find the token hash in the database
        // We can't query by the token itself, so this is tricky. We must find all tokens for
        // the user *first* by verifying the JWT (if it contains user ID) or find another way.
        
        // --- A more secure way: ---
        // Let's decode the *expired* access token to find the user ID.
        // This is safe because we don't trust its expiry, just its payload.
        const oldAccessToken = req.headers["authorization"]?.split(" ")[1];
        if (!oldAccessToken) throw new apiError(401, "Old access token is required");

        const decodedOldToken = jwt.decode(oldAccessToken);
        const userId = decodedOldToken?.id;
        if (!userId) throw new apiError(401, "Invalid old access token");

        // 2. Get all valid refresh tokens for that user
        const tokenResult = await pool.query(
            "SELECT id, token_hash FROM crm.user_refresh_tokens WHERE user_id = $1 AND expires_at > NOW()",
            [userId]
        );

        if (tokenResult.rows.length === 0) throw new apiError(401, "No valid refresh tokens found. Please log in again.");

        // 3. Find the matching token
        let foundTokenDbId = null;
        for (const row of tokenResult.rows) {
            const didMatch = await bcrypt.compare(refreshToken, row.token_hash);
            if (didMatch) {
                foundTokenDbId = row.id;
                break;
            }
        }

        if (!foundTokenDbId) throw new apiError(401, "Invalid refresh token. Please log in again.");

        // --- 4. SECURITY (Token Rotation): Delete the token we just used ---
        // This prevents replay attacks.
        await pool.query("DELETE FROM crm.user_refresh_tokens WHERE id = $1", [foundTokenDbId]);

        // 5. Issue a new *Access Token* (and a new Refresh Token for best security)
        
        // --- Re-create Access Token ---
        const userResult = await pool.query("SELECT id, phone, first_name FROM crm.users WHERE id = $1", [userId]);
        const user = userResult.rows[0];
        const accessTokenPayload = { id: user.id, phone: user.phone };
        const accessTokenExpiresIn = '15m';
        const accessToken = jwt.sign(accessTokenPayload, process.env.JWT_SECRET, { expiresIn: accessTokenExpiresIn });
        const accessTokenExpiresAt = Date.now() + (15 * 60 * 1000);

        // --- Re-create Refresh Token ---
        const newRefreshToken = randomBytes(64).toString('hex');
        const newRefreshTokenExpiresAt = new Date(Date.now() + (7 * 24 * 60 * 60 * 1000));
        const newRefreshTokenHash = await bcrypt.hash(newRefreshToken, 10);
        
        await pool.query(
            "INSERT INTO crm.user_refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)",
            [user.id, newRefreshTokenHash, newRefreshTokenExpiresAt]
        );

        // 6. Send the new tokens
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