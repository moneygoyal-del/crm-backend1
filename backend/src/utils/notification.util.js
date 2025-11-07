import axios from 'axios';
import { pool } from '../DB/db.js';
import { URLSearchParams } from 'url';
import qrcode from 'qrcode';

// --- 1. Reusable UltraMsg Function ---
const sendUltraMsg = async (to, body) => {
    const url = `https://api.ultramsg.com/${process.env.ULTRAMSG_INSTANCE}/messages/chat`;
    
    // UltraMsg (from your script) uses x-www-form-urlencoded
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

// --- 2. Reusable AiSensy Function ---
const sendAiSensy = async (to, name, mediaUrl) => {
    const url = 'https://backend.aisensy.com/campaign/t1/api/v2';
    
    const payload = {
        "apiKey": process.env.AISENSY_API_KEY,
        "campaignName": process.env.AISENSY_CAMPAIGN_NAME,
        "destination": `91${to}`, // Assumes 10-digit number
        "userName": "Medpho 2842", // From your script
        "templateParams": [name],
        "media": {
            "url": mediaUrl,
            "filename": "patient-qr-code"
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

// --- 3. QR Code Generator ---
// Generates a QR code as a Data URL (a base64 string)
const generateQrDataUrl = async (patientData) => {
    // This simple URL is just an example. You can build any URL you want.
    // The key is that it contains the unique booking reference.
    const patientUrl = `https://medpho.com/patient-info/?id=${patientData.booking_reference}`;
    
    try {
        // This generates a base64 string, e.g., "data:image/png;base64,iVBORw0KGgo..."
        return await qrcode.toDataURL(patientUrl);
    } catch (err) {
        console.error("Failed to generate QR code:", err);
        return null; // Return null if it fails
    }
};

// --- 4. The Main Notification Service ---
// This one function will run all 5 notifications.
export const sendOpdNotifications = async (patientData) => {
    console.log(`Sending notifications for booking: ${patientData.booking_reference}`);
    
    // We use Promise.allSettled so that one failed message doesn't
    // stop the other messages from being sent.
    const notificationPromises = [];

    // --- Notification 1: Patient (AiSensy) ---
    // Note: We generate a QR code data URL. This *should* work with AiSensy.
    // If it doesn't, you may need to upload it to a public URL first.
    const qrCodeUrl = await generateQrDataUrl(patientData);
    if (qrCodeUrl) {
        notificationPromises.push(
            sendAiSensy(patientData.patient_phone, patientData.patient_name, qrCodeUrl)
        );
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

    // Wait for all messages to finish sending
    await Promise.allSettled(notificationPromises);
    console.log(`All notifications for ${patientData.booking_reference} have been processed.`);
};

/**
 * Helper to get the hospital's WhatsApp Group ID from our database.
 */
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