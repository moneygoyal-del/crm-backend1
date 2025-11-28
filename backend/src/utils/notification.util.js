import axios from 'axios';
import { pool } from '../DB/db.js';
import { URLSearchParams } from 'url';
import https from 'https';
import "dotenv/config"; // Ensure env vars are loaded

const sendUltraMsg = async (to, body) => {
    if (!to) return; 
    
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
    const httpsAgent = new https.Agent({ family: 4 });

    try {
        const response = await axios.get(finalApiUrl, { httpsAgent: httpsAgent });
        const qrCodeImageUrl = response.data.location;
        
        if (!qrCodeImageUrl) throw new Error("QR code API response did not contain a 'location' field.");
        return qrCodeImageUrl;

    } catch (err) {
        console.error("QR Code Generation Failed:", err.message);
        return null; 
    }
};

export const sendOpdNotifications = async (patientData) => {
    console.log(`Sending notifications for booking: ${patientData.booking_reference}`);
    const notificationPromises = [];

    // 1. Patient (AiSensy)
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
        notificationPromises.push(sendAiSensy(patientData.patient_phone, patientData.patient_name, qrCodeUrl));
    }

    // 2. Hospital(s)
    let targetHospitals = [];
    if (patientData.hospital_ids && patientData.hospital_ids.length > 0) {
        try {
            const query = `SELECT hospital_name, hospital_group_id FROM crm.hospitals WHERE id = ANY($1::uuid[])`;
            const res = await pool.query(query, [patientData.hospital_ids]);
            targetHospitals = res.rows;
        } catch (e) {
            console.error("Error fetching hospital groups:", e.message);
        }
    }

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
            notificationPromises.push(sendUltraMsg(h.hospital_group_id, hospitalMessage));
        }
    });

    // 3. NDM
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
    notificationPromises.push(sendUltraMsg(patientData.ndm_phone, ndmMessage));

    // 4. Saathi Group
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
        notificationPromises.push(sendUltraMsg(saathiGroupId, saathiMessage));
    }

    // 5. Referee Doctor
    if (patientData.referee_name && patientData.referee_phone) {
        const doctorMessage = `*Dear ${patientData.referee_name},*\nA lead referred by you is posted to Medpho, and shared with the following hospitals, we will ensure smooth treatment journey for the patient, you can keep this message for further reference:\n\n` +
                            `*Unique Code:* ${patientData.booking_reference}\n` +
                            `*Name:* ${patientData.patient_name}\n` +
                            `*Medical Issue:* ${patientData.medical_condition}\n` +
                            `*Hospitals:* ${patientData.hospital_name}\n` +
                            `*Tentative Visit Date:* ${patientData.appointment_date} ${patientData.appointment_time}\n` +
                            `*NDM Contact Number:* ${patientData.ndm_phone}\n\n` +
                            `*Regards*\n*Operations, Medpho*`;
        notificationPromises.push(sendUltraMsg(patientData.referee_phone, doctorMessage));
    }

    await Promise.allSettled(notificationPromises);
};

export const sendDoctorMeetingNotification = async (doctorName, ndManagerName, doctorPhoneNumber) => {
    const url = 'https://backend.aisensy.com/campaign/t1/api/v2';
    const payload = {
        "apiKey": process.env.AISENSY_API_KEY, 
        "campaignName": "Doctor_Meeting_TypoCorrected",
        "destination": `91${doctorPhoneNumber}`,
        "userName": "Medpho 2842",
        "templateParams": [doctorName, ndManagerName],
       "source": "new-landing-page form",
       "media": {}, "buttons": [], "carouselCards": [], "location": {}, "attributes": {}
    };

    try {
        await axios.post(url, payload, { headers: { 'Content-Type': 'application/json' } });
        console.log(`AiSensy Doctor Meeting message sent to: ${doctorPhoneNumber}`);
    } catch (error) {
        console.error(`Failed to send AiSensy to ${doctorPhoneNumber}:`, error.response?.data || error.message);
    }
};

export const sendDispositionUpdateNotifications = async (data) => {
    const promises = [];
    if (data.ndmContact) {
        const ndmMessage = `*Dear Medphoite,*\nThe disposition of your lead is updated, details are as under:\n\n` +
            `*Patient Unique Code:* ${data.uniqueCode}\n` +
            `*Name:* ${data.name}\n` +
            `*Disposition:* ${data.disposition}\n` +
            `*Panel:* ${data.panel || 'N/A'}\n\n` +
            `*Regards*\n*Operations, Medpho*`;
        promises.push(sendUltraMsg(data.ndmContact, ndmMessage));
    }
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


export const sendPhoneUpdateNotifications = async (data) => {
    console.log(`Sending phone update notifications for: ${data.uniqueCode}`);
    const promises = [];

    // 1. Notify Saathi Group
    const saathiGroupId = process.env.SAATHI_GROUP_ID; 
    if (saathiGroupId) {
        const saathiMessage = `*Dear Saathi,*\nContact details of the following lead is updated, please coordinate with the patient and ensure smooth treatment journey:\n\n` +
            `*Patient Unique Code:* ${data.uniqueCode}\n` +
            `*Name:* ${data.name}\n` +
            `*Patient Age:* ${data.age} years\n` +
            `*Gender:* ${data.gender}\n` +
            `*Medical Issue:* ${data.medicalIssue}\n` +
            `*Panel:* ${data.panel}\n` +
            `*Hospitals:* ${data.hospitals}\n` +
            `*NDM Contact Number:* ${data.ndmContact}\n` +
            `*Patient Phone Number:* ${data.phoneNumber}\n` +
            `*Tentative Visiting Date:* ${data.visitingDate}\n\n` +
            `*Regards*\n*Operations, Medpho*`;
        
        promises.push(sendUltraMsg(saathiGroupId, saathiMessage));
    }


    if (data.ndmContact) {
        const ndmMessage = `*Dear Medphoite,*\nYour lead's with the is successfully updated and shared with Saathi Group, details are as under:\n\n` +
            `*Patient Unique Code:* ${data.uniqueCode}\n` +
            `*Name:* ${data.name}\n` +
            `*Patient Number:* ${data.phoneNumber}\n` +
            `*Patient Age:* ${data.age} years\n` +
            `*Gender:* ${data.gender}\n` +
            `*Medical Issue:* ${data.medicalIssue}\n` +
            `*Panel:* ${data.panel}\n\n` +
            `*Regards*\n*Operations, Medpho*`;
        promises.push(sendUltraMsg(data.ndmContact, ndmMessage));
    }

    // 3. Notify Hospitals
    if (data.hospitalIds && data.hospitalIds.length > 0) {
        try {
            const query = `SELECT hospital_name, hospital_group_id FROM crm.hospitals WHERE id = ANY($1::uuid[])`;
            const res = await pool.query(query, [data.hospitalIds]);
            const targetHospitals = res.rows;

            targetHospitals.forEach(h => {
                if (h.hospital_group_id) {
                    const hospitalMessage = `*Dear ${h.hospital_name} Management,*\nThe contact details for a prospective patient have been updated:\n\n` +
                        `*Patient Unique Code:* ${data.uniqueCode}\n` +
                        `*Name:* ${data.name}\n` +
                        `*New Patient Phone:* ${data.phoneNumber}\n` +
                        `*Patient Age:* ${data.age} years\n` +
                        `*Gender:* ${data.gender}\n` +
                        `*Medical Issue:* ${data.medicalIssue}\n` +
                        `*Panel:* ${data.panel}\n\n` +
                        `*Regards*\n*Operations, Medpho*`;
                    promises.push(sendUltraMsg(h.hospital_group_id, hospitalMessage));
                }
            });
        } catch (e) {
            console.error("Error fetching hospital groups for update:", e.message);
        }
    }

    await Promise.allSettled(promises);
};