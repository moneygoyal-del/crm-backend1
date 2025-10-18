import apiResponse from "../utils/apiResponse.utils.js";
import asyncHandler from "../utils/asynchandler.utils.js";
import { process_phone_no, parseTimestamp, processString, processTimeStamp } from "../helper/preprocess_data.helper.js";
import { pool } from "../DB/db.js";
import readCsvFile from "../helper/read_csv.helper.js";
import fs from "fs";


export default class patientLeadController {
    createPatientLead = asyncHandler((req, res, next) => {

    });

    createPatientLeadBatchUpload = asyncHandler(async (req, res, next) => {
        const file = req.file;
        if (!file) throw new apiError(400, "No file uploaded.");

        const patientLeads = await readCsvFile(file.path);

        fs.unlink(file.path, (err) => {
            if (err) {
                console.error('Error deleting file:', err);
            } else {
                console.log('File deleted successfully:', file.path);
            }
        });

        const data = [];
        const failedRows = []; 

        for(const i in patientLeads){
            const rowNumber = Number(i) + 2; 
            try {
                const row = patientLeads[i];
                const city = processString(row[0]); 
                const hospital_name = processString(row[1]);
                const ndm_contact = row[2];
                const refree_name = row[3];
                const refree_phone_no = row[4];
                const patient_name = row[5];
                const patient_phone = row[6];
                const _age = row[7];
                let age = null;
                
                // Age validation logic to handle very large or invalid values
                if (_age !== "N/A" && _age) {
                    const parsedAge = parseInt(_age, 10);
                    // Check if it's a valid number and within a reasonable range (e.g., 0 to 120)
                    if (isNaN(parsedAge) || parsedAge < 0 || parsedAge > 120) {
                        throw new Error(`Invalid or unrealistic Age value: ${_age}. Age must be a number between 0 and 120.`);
                    }
                    age = parsedAge;
                }
                
                const gender = row[8];
                const medical_condition = row[9];
                const panel = row[10];
                const credits = row[11];
                const timestamp = processTimeStamp(row[12]);
                const booking_reference = row[13];
                const tentative_visit_date = processTimeStamp(row[14]);
                const source = row[15];
                const current_disposition = row[16];
                const patient_diposition_last_update = processTimeStamp(row[17]);
                
                if(!refree_phone_no)continue;
                const doctor = await pool.query("SELECT id FROM doctors WHERE phone = $1",[refree_phone_no]);
                if(doctor?.rows?.length == 0)continue;
                const refree_id = doctor?.rows[0]?.id;
                
                if(!ndm_contact)continue;
                const ndm = await pool.query("SELECT id FROM users WHERE phone = $1",[ndm_contact]);
                if(ndm?.rows?.length == 0)continue;
                const created_by_agent_id = ndm?.rows[0]?.id;
                
                
                const created_at = new Date().toISOString(); 
                if(!tentative_visit_date)continue;           
                const appointment_date = tentative_visit_date.split("T")[0];  
                //save the opd
                const newOPD = await pool.query(
                    "INSERT INTO opd_bookings (booking_reference,patient_name,patient_phone,age,gender,medical_condition,hospital_name,appointment_date,current_disposition,created_by_agent_id,last_interaction_date,source,referee_id,created_at,updated_at, payment_mode) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16) RETURNING id,booking_reference ",
                    [booking_reference,patient_name,patient_phone,age,gender,medical_condition,hospital_name,appointment_date,current_disposition,created_by_agent_id,patient_diposition_last_update,"doctor",refree_id,created_at,created_at, panel]
                )
                data.push(newOPD.rows[0]);
            } catch (error) {
                console.error(`[Row ${rowNumber}]: FAILED with error: ${error.message}`);
                failedRows.push({ rowNumber: rowNumber, reason: error.message });
            }
        }

        res.status(201).json(new apiResponse(201, {
            newly_created_count: data.length,
            failed_count: failedRows.length,
            failures: failedRows
        }, "Opd Bookings batch processing complete."));

    });

    createDispositionLogBatchUpload = asyncHandler(async (req, res, next) => {
        const file = req.file;
        if (!file) throw new apiError(400, "No file uploaded.");

        const dispositionLogs = await readCsvFile(file.path);

        fs.unlink(file.path, (err) => {
            if (err) {
                console.error('Error deleting file:', err);
            } else {
                console.log('File deleted successfully:', file.path);
            }
        });

        const logsCreated = [];
        const failedRows = [];

        for(const i in dispositionLogs){
            const row = dispositionLogs[i];
            const rowNumber = Number(i) + 2; 
            try {
                // CSV Index mapping (from "Patient Appointment Master Data - PatientDispositionLogs.csv" snippet):
                const uniqueCode = row[0]// booking_reference
                const initialDisposition = processString(row[2]); // previous_disposition
                const nextDisposition = processString(row[3]); // new_disposition
                const comments = row[4]; // notes
                const timestampRaw = row[5]; // created_at

                if (!uniqueCode || !nextDisposition) {
                     throw new Error("Missing Unique Code or Next Disposition (required fields).");
                }
                
                // Process timestamp
                const created_at = processTimeStamp(timestampRaw);
                
                // 1. Find opd_booking_id and medical_condition from opd_bookings
                const opdResult = await pool.query(
                    "SELECT id, medical_condition FROM opd_bookings WHERE booking_reference = $1",
                    [uniqueCode]
                );

                if (opdResult.rows.length === 0) {
                    throw new Error(`OPD Booking not found for unique code: ${uniqueCode}`);
                }
                
                const opd_booking_id = opdResult.rows[0].id;
                // Map medical_condition (from opd_bookings) to disposition_reason (in logs) 
                const disposition_reason = opdResult.rows[0].medical_condition; 
                
                // 2. Insert into opd_dispositions_logs
                const newLog = await pool.query(
                    `INSERT INTO opd_dispositions_logs (
                        opd_booking_id, previous_disposition, new_disposition, disposition_reason, notes, created_at, updated_by_user_id
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7) 
                    RETURNING id, opd_booking_id, new_disposition`,
                    [
                        opd_booking_id,
                        initialDisposition, // From CSV Index 2
                        nextDisposition, // From CSV Index 3
                        disposition_reason, // From opd_bookings.medical_condition
                        comments, // From CSV Index 4
                        created_at, // From CSV Index 5
                        null // updated_by_user_id is set to null as per request
                    ]
                );
                
                logsCreated.push(newLog.rows[0]);

            } catch (error) {
                console.error(`[Row ${rowNumber}]: FAILED with error: ${error.message}`);
                failedRows.push({ rowNumber, reason: error.message });
            }
        }

        res.status(201).json(new apiResponse(201, {
            newly_created_count: logsCreated.length,
            failed_count: failedRows.length,
            failures: failedRows
        }, "OPD Disposition Logs batch processing complete."));

    });


    updatePatientLead = asyncHandler((req, res, next) => {

    });


    deletePatientLead = asyncHandler((req, res, next) => {

    });
}