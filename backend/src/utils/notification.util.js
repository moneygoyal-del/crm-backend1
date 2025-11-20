import axios from 'axios';
import { pool } from '../DB/db.js';
import { URLSearchParams } from 'url';
import https from 'https';


const sendUltraMsg = async (to, body) => {
    if (!to) return; // Safety check
    
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


export const sendAiSensy = async (to, name, mediaUrl) => {
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


export const fetchQrCodeUrl = async (patientData) => {
    const baseUrl = "https://medpho-public.s3.amazonaws.com/patientinformation/patient-information.html?";
    const qrCodeUrlAPI = "https://backend.medpho.com/v1/qrCode/generateQRCode?url=";

    const patientParams = new URLSearchParams({
        name: patientData.name || "N/A",
        age: patientData.age || "N/A",
        gender: patientData.gender || "N/A",
        credits: patientData.credits || "0",
        phoneNumber: patientData.phoneNumber || "",
        uniqueCode: patientData.uniqueCode || "",
        timeStamp: patientData.timestamp || new Date().toISOString()
    });

    const patientUrl = baseUrl + patientParams.toString();
    const finalApiUrl = qrCodeUrlAPI + encodeURIComponent(patientUrl);

    // // --- NEW LOGGING ---
    // console.log("-------------------------------------------------");
    // console.log("Attempting to generate QR Code...");
    // console.log("Patient URL (unencoded):", patientUrl);
    // console.log("Final API URL (encoded):", finalApiUrl);
    // --- END NEW LOGGING ---

    const httpsAgent = new https.Agent({ family: 4 });

    try {
        const response = await axios.get(finalApiUrl, { httpsAgent: httpsAgent });
        // console.log(response)
    const qrCodeImageUrl = response.data.location;

        
        if (!qrCodeImageUrl) {
            console.error("QR Code API Error: Response received, but 'location' field was missing.");
            console.error("Full Response Data:", response.data);
            throw new Error("QR code API response did not contain a 'location' field.");
        }
        
        console.log("QR Code Test: Success! Received URL:", qrCodeImageUrl);
        console.log("-------------------------------------------------");
        return qrCodeImageUrl;

    } catch (err) {
        // --- NEW DETAILED ERROR LOGGING ---
        console.error("--- QR Code Test: FAILED ---");
        console.error("Failed to generate QR code from Medpho API.");

        if (axios.isAxiosError(err)) {
            console.error("Axios Error:", err.message);
            if (err.response) {
                // The request was made and the server responded with a status code
                console.error("Status Code:", err.response.status);
                console.error("Response Data:", err.response.data);
            } else if (err.request) {
                // The request was made but no response was received
                console.error("No response received. Is the domain backend.medpho.com reachable?");
            }
        } else {
            // Something else happened (like the 'location' field missing)
            console.error("Non-Axios Error:", err.message);
        }
        console.log("-------------------------------------------------");
        // --- END NEW LOGGING ---
        
        return null; // Return null if it fails
    }
};


export const sendOpdNotifications = async (patientData) => {
    console.log(`Sending notifications for booking: ${patientData.booking_reference}`);
    
    const notificationPromises = [];

    // --- Notification 1: Patient (AiSensy) ---
    const qrPatientData = {
        name: patientData.patient_name,
        age: patientData.age || "N/A",
        gender: patientData.gender || "N/A",
        credits: patientData.credits || "0", 
        phoneNumber: patientData.patient_phone,
        uniqueCode: patientData.booking_reference, 
        timestamp: new Date().toISOString()
    };
    
    const qrCodeUrl = await fetchQrCodeUrl(qrPatientData);
    
    if (qrCodeUrl) {
        notificationPromises.push(
            sendAiSensy(patientData.patient_phone, patientData.patient_name, qrCodeUrl)
        );
    } else {
        console.error("Skipping patient notification because QR code generation failed.");
    }

    // --- Notification 2: Hospital(s) (UltraMsg) ---
    
    // 1. Get list of hospitals using IDs array
    let targetHospitals = [];
    const ids = patientData.hospital_ids; // Already an array

    if (ids && ids.length > 0) {
        try {
            // Fetch hospital group IDs using "ANY" operator for array
            const query = `
                SELECT hospital_name, hospital_group_id 
                FROM crm.hospitals 
                WHERE id = ANY($1::uuid[])
            `;
            
            const res = await pool.query(query, [ids]);
            targetHospitals = res.rows;

        } catch (e) {
            console.error("Error fetching hospital groups:", e.message);
        }
    }

    // 2. Send message to EACH hospital group found
    targetHospitals.forEach(h => {
        if (h.hospital_group_id) {
            const hospitalMessage = `*Dear ${h.hospital_name} Management,*\nWe have a new prospective patient, details are as under:\n\n` +
                                  `*Name:* ${patientData.patient_name}\n` +
                                  `*Patient Age:* ${patientData.age} years\n` +
                                  `*Gender:* ${patientData.gender}\n` +
                                  `*Medical Issue:* ${patientData.medical_condition}\n` +
                                  `*Panel:* ${patientData.panel}\n` +
                                  `*Patient Code:* ${patientData.booking_reference}\n\n` +
                                  `*Regards*\n*Operations, Medpho*`;
            
            notificationPromises.push(
                sendUltraMsg(h.hospital_group_id, hospitalMessage)
            );
        } else {
            console.warn(`No hospital_group_id for: ${h.hospital_name}`);
        }
    });

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


export const sendDoctorMeetingNotification = async (doctorName, ndManagerName, doctorPhoneNumber) => {
 
    const url = 'https://backend.aisensy.com/campaign/t1/api/v2';
    // console.log(doctorName,ndManagerName,doctorPhoneNumber)

  
    const payload = {
        "apiKey": process.env.AISENSY_API_KEY, 
        "campaignName": "Doctor_Meeting_TypoCorrected",
        "destination": `91${doctorPhoneNumber}`,
        "userName": "Medpho 2842",
        "templateParams": [
            doctorName,
            ndManagerName
        ],

       "source": "new-landing-page form",
  "media": {},
  "buttons": [],
  "carouselCards": [],
  "location": {},
  "attributes": {},
  "paramsFallbackValue": {
    "FirstName": "user"
  }

    };


    try {
        await axios.post(url, payload, {
            headers: { 'Content-Type': 'application/json' }
        });
        console.log(`AiSensy Doctor Meeting message sent to: ${doctorPhoneNumber}`);
    } catch (error) {
        console.error(`Failed to send AiSensy to ${doctorPhoneNumber}:`, error.response?.data || error.message);
    }

};

/**
 * Sends WhatsApp notifications to NDM and Referee when a patient's disposition is updated.
 * @param {Object} data - The data object containing patient, ndm, and referee details.
 */
export const sendDispositionUpdateNotifications = async (data) => {
    console.log(`Sending disposition update notifications for: ${data.uniqueCode}`);

    const promises = [];

    // 1. Notify NDM (Logged-in User / Agent)
    if (data.ndmContact) {
        const ndmMessage = `*Dear Medphoite,*\nThe disposition of your lead is updated, details are as under:\n\n` +
            `*Patient Unique Code:* ${data.uniqueCode}\n` +
            `*Name:* ${data.name}\n` +
            `*Disposition:* ${data.disposition}\n` +
            `*Panel:* ${data.panel || 'N/A'}\n\n` +
            `*Regards*\n*Operations, Medpho*`;
        
        promises.push(sendUltraMsg(data.ndmContact, ndmMessage));
    }

    // 2. Notify Referee (Doctor)
    if (data.refereeContactNumber && data.refereeName) {
        const refereeMessage = `*Dear ${data.refereeName},*\nThe disposition of your referee patient is updated, details are as under:\n\n` +
            `*Patient Unique Code:* ${data.uniqueCode}\n` +
            `*Name:* ${data.name}\n` +
            `*Disposition:* ${data.disposition}\n` +
            `*Panel:* ${data.panel || 'N/A'}\n\n` +
            `*Regards*\n*Operations, Medpho*`;
        
        promises.push(sendUltraMsg(data.refereeContactNumber, refereeMessage));
    }

    await Promise.allSettled(promises);
};