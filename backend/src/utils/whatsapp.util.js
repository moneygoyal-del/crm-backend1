import axios from 'axios';
import { URLSearchParams } from 'url';
import apiError from './apiError.utils.js';
import "dotenv/config";

// Get these from your UltraMsg account (as provided in your example)
const ULTRAMSG_TOKEN = process.env.ULTRAMSG_TOKEN;
const ULTRAMSG_INSTANCE = process.env.ULTRAMSG_INSTANCE;

/**
 * Sends a WhatsApp message using the UltraMsg API.
 * @param {string} phone - The recipient's phone number (e.g., "91xxxxxxxxxx").
 * @param {string} message - The text message to send.
 */
export const sendWhatsAppMessage = async (phone, message) => {
    const url = `https://api.ultramsg.com/${ULTRAMSG_INSTANCE}/messages/chat`;
    
    // The API expects 'x-www-form-urlencoded' data
    const params = new URLSearchParams();
    params.append('token', ULTRAMSG_TOKEN);
    params.append('to', phone);
    params.append('body', message);

    const options = {
        headers: {
            'content-type': 'application/x-www-form-urlencoded'
        }
    };

    try {
        const response = await axios.post(url, params, options);
        console.log("WhatsApp message sent:", response.data);
        return response.data;
    } catch (error) {
        console.error("Error sending WhatsApp message:", error.response?.data || error.message);
        throw new apiError(500, "Failed to send OTP message");
    }
};