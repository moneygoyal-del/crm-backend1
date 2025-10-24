import apiResponse from "../utils/apiResponse.utils.js";
import asyncHandler from "../utils/asynchandler.utils.js";
import { process_phone_no, parseTimestamp, processString, processTimeStamp } from "../helper/preprocess_data.helper.js";
import { pool } from "../DB/db.js";
import readCsvFile from "../helper/read_csv.helper.js";
import fs from "fs";
import apiError from "../utils/apiError.utils.js";

export default class patientLeadController {
    
    // --- CREATE SINGLE OPD BOOKING ---
    createPatientLead = asyncHandler(async (req, res, next) => {
        let {
            hospital_name, ndm_contact, refree_phone_no, patient_name, patient_phone, 
            age: _age, gender, medical_condition, panel, // 'panel' is mapped to 'payment_mode' in the DB query
            booking_reference, tentative_visit_date: tentative_visit_dateRaw,
            current_disposition, patient_diposition_last_update: patient_diposition_last_updateRaw
        } = req.body; 

        // --- Data Processing and Validation ---
        hospital_name = processString(hospital_name);
        
        if (!refree_phone_no || !ndm_contact || !patient_name || !patient_phone || !medical_condition || !hospital_name || !booking_reference || !tentative_visit_dateRaw) {
             throw new apiError(400, "Missing required fields: referee phone, NDM contact, patient name/phone, medical condition, hospital name, booking reference, or tentative visit date.");
        }

        // Process phone numbers 
        const patient_phone_processed = process_phone_no(patient_phone);
        const refree_phone_processed = process_phone_no(refree_phone_no);
        const ndm_contact_processed = process_phone_no(ndm_contact);

        let age = null;
        if (_age !== "N/A" && _age) {
            const parsedAge = parseInt(_age, 10);
            if (isNaN(parsedAge) || parsedAge < 0 || parsedAge > 120) {
                throw new apiError(400, `Invalid or unrealistic Age value: ${_age}. Age must be a number between 0 and 120.`);
            }
            age = parsedAge;
        }

        const created_at = new Date().toISOString(); 
        const patient_diposition_last_update = processTimeStamp(patient_diposition_last_updateRaw || created_at);
        const tentative_visit_date = processTimeStamp(tentative_visit_dateRaw);
        
        if(!tentative_visit_date) {
            throw new apiError(400, "Invalid Tentative Visit Date format.");
        }
        const appointment_date = tentative_visit_date.split("T")[0];

        // --- Dependency Lookups ---

        // 1. Find Doctor (referee_id)
        const doctor = await pool.query("SELECT id FROM doctors WHERE phone = $1",[refree_phone_processed]);
        if(doctor.rows.length === 0) {
            throw new apiError(404, `Referee Doctor not found with phone: ${refree_phone_no}`);
        }
        const referee_id = doctor.rows[0].id;

        // 2. Find NDM (created_by_agent_id)
        const ndm = await pool.query("SELECT id FROM users WHERE phone = $1",[ndm_contact_processed]);
        if(ndm.rows.length === 0) {
            throw new apiError(404, `NDM/Agent not found with phone: ${ndm_contact}`);
        }
        const created_by_agent_id = ndm.rows[0].id;

        // --- Database Insertion (opd_bookings) ---
        
        const newOPD = await pool.query(
            "INSERT INTO opd_bookings (booking_reference,patient_name,patient_phone,age,gender,medical_condition,hospital_name,appointment_date,current_disposition,created_by_agent_id,last_interaction_date,source,referee_id,created_at,updated_at, payment_mode) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16) RETURNING id, booking_reference, patient_name ",
            [
                booking_reference, patient_name, patient_phone_processed, age, gender, medical_condition, 
                hospital_name, appointment_date, current_disposition, created_by_agent_id, 
                patient_diposition_last_update, "doctor", referee_id, created_at, created_at, panel
            ]
        );

        if (!newOPD.rows || newOPD.rows.length === 0) {
            throw new apiError(500, "Failed to create new OPD booking.");
        }


        res.status(201).json(new apiResponse(201, newOPD.rows[0], `OPD Booking ${booking_reference} successfully created.`));
    });

    // --- BATCH UPLOAD OPD BOOKINGS ---
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

    // --- BATCH UPLOAD DISPOSITION LOGS  ---
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
    
        // --- OPTIMIZATION SETUP ---
        const logsToInsert = [];
        const failedRows = [];
        const uniqueCodes = [];
        const opdMap = {}; // Map to store lookup results: {booking_reference: {id, medical_condition}}
        const startTime = Date.now();
        
        // 1. PHASE 1: Collect all unique booking references for bulk lookup
        for (const row of dispositionLogs) {
            if (row[0]) {
                uniqueCodes.push(row[0]);
            }
        }
    
        if (uniqueCodes.length === 0) {
             return res.status(201).json(new apiResponse(201, { newly_created_count: 0, failed_count: 0, failures: [] }, "No valid data to process."));
        }
    
        // 2. PHASE 2: Perform BULK LOOKUP
        // Construct placeholder string for the IN clause (e.g., $1, $2, $3, ...)
        const placeholderList = uniqueCodes.map((_, i) => `$${i + 1}`).join(', ');
    
        const bulkOpdResult = await pool.query(
            `SELECT id, medical_condition, booking_reference FROM opd_bookings WHERE booking_reference IN (${placeholderList})`,
            uniqueCodes
        );
    
        // Populate the lookup map for fast O(1) access inside the main loop
        bulkOpdResult.rows.forEach(row => {
            opdMap[row.booking_reference] = { 
                id: row.id, 
                medical_condition: row.medical_condition 
            };
        });
        // --- END OPTIMIZATION SETUP ---
    
        // 3. PHASE 3: Loop and Collect Data for Bulk Insert
        for(const i in dispositionLogs){
            const row = dispositionLogs[i];
            const rowNumber = Number(i) + 2; 
    
            try {
                const uniqueCode = row[0];
                const initialDispositionRaw = processString(row[2]);
                const initialDisposition = initialDispositionRaw === "na" ? null : initialDispositionRaw;
                const nextDisposition = processString(row[3]);
                const comments = row[4];
                const timestampRaw = row[5];
    
                if (!uniqueCode || !nextDisposition) {
                     throw new Error("Missing Unique Code or Next Disposition (required fields).");
                }
                
                // Check lookup map instead of hitting the DB again
                const opdData = opdMap[uniqueCode]; 
                
                if (!opdData) {
                    throw new Error(`OPD Booking not found for unique code: ${uniqueCode}`);
                }
                
                const created_at = processTimeStamp(timestampRaw);
                
                // Collect all values into a single array for the final bulk insert
                logsToInsert.push(
                    opdData.id, 
                    initialDisposition, 
                    nextDisposition, 
                    opdData.medical_condition, 
                    comments, 
                    created_at, 
                    null // updated_by_user_id is set to null
                );
    
            } catch (error) {
                console.error(`[Row ${rowNumber}]: FAILED with error: ${error.message}`);
                failedRows.push({ rowNumber, reason: error.message });
            }
        }
        
        let logsCreatedCount = 0;
        
        // 4. PHASE 4: Perform BULK INSERT
        if (logsToInsert.length > 0) {
            const columns = [
                'opd_booking_id', 'previous_disposition', 'new_disposition', 
                'disposition_reason', 'notes', 'created_at', 'updated_by_user_id'
            ];
            const rowLength = columns.length; // 7 columns per row
    
            // Generate placeholders: ($1, $2, $3, ...), ($8, $9, $10, ...), ...
            const valuePlaceholders = logsToInsert
                .map((_, i) => i + 1)
                .reduce((acc, v, i) => {
                    const groupIndex = Math.floor(i / rowLength);
                    if (i % rowLength === 0) {
                        acc.push(`($${v}, $${v + 1}, $${v + 2}, $${v + 3}, $${v + 4}, $${v + 5}, $${v + 6})`);
                    }
                    return acc;
                }, [])
                .join(', ');
    
            const bulkInsertQuery = `
                INSERT INTO opd_dispositions_logs (${columns.join(', ')}) 
                VALUES ${valuePlaceholders}
            `;
    
            const result = await pool.query(bulkInsertQuery, logsToInsert);
            logsCreatedCount = result.rowCount;
        }
        
        // --- FINAL TIME TRACKING ---
        const endTime = Date.now();
        const totalTimeSeconds = (endTime - startTime) / 1000;
        console.log(`\n--- Batch Processing Complete ---`);
        console.log(`Processed ${dispositionLogs.length} rows in ${totalTimeSeconds.toFixed(2)} seconds.`);
        console.log(`Successes: ${logsCreatedCount}, Failures: ${failedRows.length}.`);
        // ---------------------------
    
        res.status(201).json(new apiResponse(201, {
            newly_created_count: logsCreatedCount,
            failed_count: failedRows.length,
            failures: failedRows
        }, "OPD Disposition Logs batch processing complete."));
    
    });

    // --- UPDATE SINGLE OPD BOOKING ---  Update by booking_reference
    updatePatientLead = asyncHandler(async (req, res, next) => {
        let { 
            id, booking_reference, patient_name, patient_phone, age: _age, 
            gender, medical_condition, hospital_name, tentative_visit_date, 
            current_disposition, panel // 'panel' maps to 'payment_mode'
        } = req.body;

        if (!id && !booking_reference) {
            throw new apiError(400, "Provide either 'id' or 'booking_reference' to identify the booking for update.");
        }

        const updated_at = new Date().toISOString();
        const updateFields = [];
        const queryParams = [];
        let paramIndex = 1;

        // Helper function to add fields to update query
        const addField = (value, dbColumn) => {
            if (value !== undefined && value !== null) {
                updateFields.push(`${dbColumn} = $${paramIndex++}`);
                // Use processString for simple string fields that should be lowercased and trimmed
                queryParams.push(['patient_name', 'gender', 'medical_condition', 'hospital_name', 'current_disposition'].includes(dbColumn) ? processString(value) : value);
            }
        };

        // Standard field mapping
        addField(patient_name, 'patient_name');
        addField(gender, 'gender');
        addField(medical_condition, 'medical_condition');
        addField(hospital_name, 'hospital_name');
        addField(current_disposition, 'current_disposition');
        addField(panel, 'payment_mode'); // Use 'panel' from request body, map to 'payment_mode' in DB

        if (_age !== undefined && _age !== null) {
            let age = null;
            if (_age !== "N/A" && _age) {
                const parsedAge = parseInt(_age, 10);
                if (isNaN(parsedAge) || parsedAge < 0 || parsedAge > 120) {
                    throw new apiError(400, `Invalid or unrealistic Age value: ${_age}. Age must be a number between 0 and 120.`);
                }
                age = parsedAge;
            }
            updateFields.push(`age = $${paramIndex++}`);
            queryParams.push(age);
        }
   
        if (patient_phone !== undefined && patient_phone !== null) {
            updateFields.push(`patient_phone = $${paramIndex++}`);
            queryParams.push(process_phone_no(patient_phone));
        }

        if (tentative_visit_date !== undefined && tentative_visit_date !== null) {
            const dateProcessed = processTimeStamp(tentative_visit_date);
            const appointment_date = dateProcessed ? dateProcessed.split("T")[0] : null;
            if (appointment_date) {
                updateFields.push(`appointment_date = $${paramIndex++}`);
                queryParams.push(appointment_date);
            }
        }

        // Add mandatory updated_at field
        updateFields.push(`updated_at = $${paramIndex++}`);
        queryParams.push(updated_at);
        
        // Check if there's anything to update besides the timestamp
        if (updateFields.length === 1 && updateFields[0].includes('updated_at')) {
            throw new apiError(400, "No valid fields provided for update.");
        }

        // Build WHERE clause
        let whereClause;
        if (id) {
            whereClause = `id = $${paramIndex++}`;
            queryParams.push(id);
        } else {
            whereClause = `booking_reference = $${paramIndex++}`;
            queryParams.push(booking_reference);
        }

        const updateQuery = `
            UPDATE opd_bookings 
            SET ${updateFields.join(', ')} 
            WHERE ${whereClause}
            RETURNING id, booking_reference, patient_name, updated_at
        `;

        const updatedResult = await pool.query(updateQuery, queryParams);

        if (updatedResult.rowCount === 0) {
            throw new apiError(404, "OPD booking not found for update.");
        }

        res.status(200).json(new apiResponse(200, updatedResult.rows[0], "OPD booking successfully updated"));
    });


    // --- DELETE SINGLE OPD BOOKING ---
    deletePatientLead = asyncHandler(async (req, res, next) => {
        const { id, booking_reference } = req.body;

        if (!id && !booking_reference) {
            throw new apiError(400, "Provide id or booking reference of the OPD booking to delete");
        }

        let query = "DELETE FROM opd_bookings WHERE ";
        let params = [];

        if (id) {
            query += "id = $1";
            params.push(id);
        } else { // Use booking_reference
            query += "booking_reference = $1";
            params.push(booking_reference);
        }
        
        query += " RETURNING id, booking_reference";

        const deleteResult = await pool.query(query, params);

        if (deleteResult.rowCount === 0) {
            throw new apiError(404, "OPD booking not found or already deleted.");
        }

        res.status(200).json(new apiResponse(200, deleteResult.rows[0], "OPD booking successfully deleted"));
    });
}