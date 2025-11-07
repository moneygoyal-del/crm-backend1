import axios from 'axios';
import { pool } from '../DB/db.js';
import { URLSearchParams } from 'url';
// We do not need the 'qrcode' library

// --- 1. Reusable UltraMsg Function (Unchanged) ---
const sendUltraMsg = async (to, body) => {
    const url = `https://api.ultramsg.com/${process.env.ULTRAMSG_INSTANCE}/messages/chat`;
    const params = new URLSearchParams();
    params.append('token', process.env.ULTRAMSG_TOKEN);
    params.append('to', to);
    params.append('body', body);

    try {
        await axios.post(url, params, {
            headers: { 'content-type': 'application/x-www-form-urlencoded' }
        });
        console.log(`UltraMsg sent to: ${to}`);
    } catch (error) {
        console.error(`Failed to send UltraMsg to ${to}:`, error.response?.data || error.message);
    }
};

// --- 2. Reusable AiSensy Function (Unchanged) ---
const sendAiSensy = async (to, name, mediaUrl) => {
    const url = 'https://backend.aisensy.com/campaign/t1/api/v2';
    const payload = {
        "apiKey": process.env.AISENSY_API_KEY,
        "campaignName": process.env.AISENSY_CAMPAIGN_NAME,
        "destination": `91${to}`,
        "userName": "Medpho 2842", 
        "templateParams": [name],
        "media": {
            "url": mediaUrl,
            "filename": "patient-qr-code.png"
        }
    };

    try {
        await axios.post(url, payload, {
            headers: { 'Content-Type': 'application/json' }
        });
        console.log(`AiSensy message sent to: ${to}`);
    } catch (error) {
        console.error(`Failed to send AiSensy to ${to}:`, error.response?.data || error.message);
    }
};

// --- 3. QR Code Generator (CORRECTED to match your Apps Script) ---
const fetchQrCodeUrl = async (patientData) => {
    // These URLs are copied directly from your Apps Script
    const baseUrl = "https://medpho-public.s3.amazonaws.com/patientinformation/patient-information.html?";
    const qrCodeUrlAPI = "https://backend.medpho.com/v1/qrCode/generateQRCode?url=";

    // We build the URL with the same parameters as your script
    const patientParams = new URLSearchParams({
        name: patientData.patient_name,
        age: patientData.age || "N/A",
        gender: patientData.gender || "N/A",
        credits: patientData.credits || "0", // Apps Script defaults to "0"
        phoneNumber: patientData.patient_phone,
        uniqueCode: patientData.booking_reference, // This is the new Unique ID
        timeStamp: new Date().toISOString() // Live timestamp
    });

    const patientUrl = baseUrl + patientParams.toString();

    // Build the final API call URL
    const finalApiUrl = qrCodeUrlAPI + encodeURIComponent(patientUrl);

    try {
        // Fetch the QR code URL from your internal API
        const response = await axios.get(finalApiUrl);
        // Parse the response to get the location, just like your script
        const qrCodeImageUrl = response.data.location;
        
        if (!qrCodeImageUrl) {
            throw new Error("QR code API response did not contain a 'location' field.");
        }
        
        return qrCodeImageUrl;

    } catch (err) {
        console.error("Failed to generate QR code from Medpho API:", err.message);
        return null; // Return null if it fails
    }
};

// --- 4. The Main Notification Service (Updated to 'await' the new function) ---
export const sendOpdNotifications = async (patientData) => {
    console.log(`Sending notifications for booking: ${patientData.booking_reference}`);
    
    const notificationPromises = [];

    // --- Notification 1: Patient (AiSensy) ---
    // This now correctly calls your internal QR code API
    const qrCodeUrl = await fetchQrCodeUrl(patientData);
    
    if (qrCodeUrl) {
        notificationPromises.push(
            sendAiSensy(patientData.patient_phone, patientData.patient_name, qrCodeUrl)
        );
    } else {
        console.error("Skipping patient notification because QR code generation failed.");
    }

    // --- Notification 2: Hospital(s) (UltraMsg) ---
    const hospitalGroupId = await getHospitalGroupId(patientData.hospital_name);
    if (hospitalGroupId) {
        const hospitalMessage = `*Dear ${patientData.hospital_name} Management,*\nWe have a new prospective patient, details are as under:\n\n` +
                              `*Name:* ${patientData.patient_name}\n` +
                              `*Patient Age:* ${patientData.age} years\n` +
                              `*Gender:* ${patientData.gender}\n` +
                              `*Medical Issue:* ${patientData.medical_condition}\n` +
                              `*Panel:* ${patientData.panel}\n` +
                              `*Patient Code:* ${patientData.booking_reference}\n\n` +
                              `*Regards*\n*Operations, Medpho*`;
        notificationPromises.push(
            sendUltraMsg(hospitalGroupId, hospitalMessage)
        );
    }

    // --- Notification 3: NDM/Agent (UltraMsg) ---
    const ndmMessage = `*Dear Medphoite,*\nYour lead is successfully posted to Medpho, and shared with respective hospitals, details are as under:\n\n` +
                     `*Unique Code:* ${patientData.booking_reference}\n` +
                     `*Name:* ${patientData.patient_name}\n` +
                     `*Patient Age:* ${patientData.age} years\n` +
                     `*Gender:* ${patientData.gender}\n` +
                     `*Medical Issue:* ${patientData.medical_condition}\n` +
                     `*Hospitals:* ${patientData.hospital_name}\n` +
                     `*Tentative Visit Date:* ${patientData.appointment_date} ${patientData.appointment_time}\n` +
                     `*Panel:* ${patientData.panel}\n\n` +
                     `*Regards*\n*Operations, Medpho*`;
    notificationPromises.push(
        sendUltraMsg(patientData.ndm_phone, ndmMessage)
    );

    // --- Notification 4: Saathi Group (UltraMsg) ---
    const saathiGroupId = process.env.SAATHI_GROUP_ID;
    if (saathiGroupId) {
        const saathiMessage = `*Dear Saathi,*\nA lead is posted to Medpho, and shared with the following hospitals, please coordinate with the patients and ensure smooth treatment journey:\n\n` +
                            `*Unique Code:* ${patientData.booking_reference}\n` +
                            `*Name:* ${patientData.patient_name}\n` +
                            `*Patient Age:* ${patientData.age} years\n` +
                            `*Gender:* ${patientData.gender}\n` +
                            `*Medical Issue:* ${patientData.medical_condition}\n` +
                            `*Panel:* ${patientData.panel}\n` +
                            `*Hospitals:* ${patientData.hospital_name}\n` +
                            `*Tentative Visit Date:* ${patientData.appointment_date} ${patientData.appointment_time}\n` +
                            `*NDM Contact Number:* ${patientData.ndm_phone}\n` +
                            `*Patient Phone Number:* ${patientData.patient_phone}\n\n` +
                            `*Regards*\n*Operations, Medpho*`;
        notificationPromises.push(
            sendUltraMsg(saathiGroupId, saathiMessage)
        );
    }

    // --- Notification 5: Referee Doctor (UltraMsg) ---
    if (patientData.referee_name && patientData.referee_phone) {
        const doctorMessage = `*Dear ${patientData.referee_name},*\nA lead referred by you is posted to Medpho, and shared with the following hospitals, we will ensure smooth treatment journey for the patient, you can keep this message for further reference:\n\n` +
                            `*Unique Code:* ${patientData.booking_reference}\n` +
                            `*Name:* ${patientData.patient_name}\n` +
                            `*Medical Issue:* ${patientData.medical_condition}\n` +
                            `*Hospitals:* ${patientData.hospital_name}\n` +
                            `*Tentative Visit Date:* ${patientData.appointment_date} ${patientData.appointment_time}\n` +
                            `*NDM Contact Number:* ${patientData.ndm_phone}\n\n` +
                            `*Regards*\n*Operations, Medpho*`;
        notificationPromises.push(
            sendUltraMsg(patientData.referee_phone, doctorMessage)
        );
    }

    await Promise.allSettled(notificationPromises);
    console.log(`All notifications for ${patientData.booking_reference} have been processed.`);
};

// --- (Helper function is unchanged) ---
const getHospitalGroupId = async (hospitalName) => {
    try {
        const result = await pool.query(
            "SELECT hospital_group_id FROM crm.hospitals WHERE hospital_name = $1",
            [hospitalName]
        );
        
        if (result.rows.length > 0) {
            return result.rows[0].hospital_group_id;
        }
        console.warn(`No hospital_group_id found for: ${hospitalName}`);
        return null;
    } catch (error) {
        console.error("Error fetching hospital group ID:", error.message);
        return null;
    }
};