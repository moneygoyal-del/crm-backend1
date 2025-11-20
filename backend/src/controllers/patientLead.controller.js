import apiResponse from "../utils/apiResponse.utils.js";
import asyncHandler from "../utils/asynchandler.utils.js";
import { process_phone_no, parseTimestamp, processString, processTimeStamp } from "../helper/preprocess_data.helper.js";
import { pool } from "../DB/db.js";
import readCsvFile from "../helper/read_csv.helper.js";
import apiError from "../utils/apiError.utils.js";
import { addToSheetQueue } from "../utils/sheetQueue.util.js"; 
import { sendOpdNotifications,fetchQrCodeUrl,sendAiSensy, sendDispositionUpdateNotifications } from "../utils/notification.util.js";
import { uploadAndGetLink } from "../utils/driveUploader.utils.js"; 
import fs from "fs/promises"; 
import path from "path";
import { logAudit } from "../utils/auditLogger.util.js";

export default class patientLeadController {

    
    createPatientLead = asyncHandler(async (req, res, next) => {
        let {
            hospital_name, ndm_contact, refree_phone_no, patient_name, patient_phone,
            age: _age, gender, medical_condition, panel, // 'panel' is mapped to 'payment_mode' in the DB query
            booking_reference, tentative_visit_date: tentative_visit_dateRaw,
            current_disposition, patient_diposition_last_update: patient_diposition_last_updateRaw
        } = req.body;

        // --- Data Processing and Validation ---
        hospital_name = processString(hospital_name);

        if (!refree_phone_no || !ndm_contact || !patient_name || !patient_phone || !medical_condition || !hospital_name || !booking_reference ) {
            throw new apiError(400, "Missing required fields: referee phone, NDM contact, patient name/phone, medical condition, hospital name, or booking reference.");
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

        const appointment_date = tentative_visit_date ? tentative_visit_date.split("T")[0] : null;

        // --- Dependency Lookups ---

        // 1. Find Doctor (referee_id)
        const doctor = await pool.query("SELECT id FROM doctors WHERE phone = $1", [refree_phone_processed]);
        if (doctor.rows.length === 0) {
            throw new apiError(404, `Referee Doctor not found with phone: ${refree_phone_no}`);
        }
        const referee_id = doctor.rows[0].id;

        // 2. Find NDM (created_by_agent_id)
        const ndm = await pool.query("SELECT id FROM users WHERE phone = $1", [ndm_contact_processed]);
        if (ndm.rows.length === 0) {
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
  
    createOpdBookingFromWeb = asyncHandler(async (req, res, next) => {
        // Get user info from the JWT token
        const loggedInUser = req.user; 
        if (!loggedInUser) {
            throw new apiError(401, "User not authenticated");
        }
        
        // 1. Destructure fields from req.body
        let {
            hospital_name, hospital_ids, // <--- NEW FIELD
            refree_phone_no, referee_name, patient_name, patient_phone,
            city, age: _age, gender, medical_condition, panel,
            booking_reference, appointment_date, appointment_time,
            current_disposition
        } = req.body;

        // --- Data Processing and Validation ---
        hospital_name = processString(hospital_name);

        // Validate required fields (added hospital_ids check)
        if (!refree_phone_no || !patient_name || !patient_phone || !medical_condition || !hospital_name || !booking_reference || !appointment_date || !appointment_time) {
            throw new apiError(400, "Missing required fields. Check all fields with *.");
        }

        // Ensure hospital_ids is an array (Multer might parse single value as string)
        const hospitalIdsArray = Array.isArray(hospital_ids) 
            ? hospital_ids 
            : (hospital_ids ? [hospital_ids] : []);

        const ndm_contact_processed = process_phone_no(loggedInUser.phone);
        
        const patient_phone_processed = process_phone_no(patient_phone);
        const refree_phone_processed = process_phone_no(refree_phone_no);

        let age = null;
        if (_age !== "N/A" && _age) {
            const parsedAge = parseInt(_age, 10);
            if (!isNaN(parsedAge) && parsedAge > 0 && parsedAge < 120) {
                age = parsedAge;
            }
        }
        
        const created_at = new Date().toISOString();
        const last_interaction_date = created_at;

        // --- Dependency Lookups ---
        const doctor = await pool.query("SELECT id FROM doctors WHERE phone = $1", [refree_phone_processed]);
        if (doctor.rows.length === 0) {
            throw new apiError(404, `Referee Doctor not found with phone: ${refree_phone_no}`);
        }
        const referee_id = doctor.rows[0].id;
        const created_by_agent_id = loggedInUser.id;

        // --- 2. Database Insertion ---
        // Insert with hospital_ids array
        const newOPD = await pool.query(
            `INSERT INTO opd_bookings (
                booking_reference, patient_name, patient_phone, age, gender, 
                medical_condition, hospital_name, hospital_ids, appointment_date, appointment_time, 
                current_disposition, aadhar_card_url, pmjay_card_url, created_by_agent_id, last_interaction_date, 
                source, referee_id, created_at, updated_at, payment_mode
            ) 
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20) 
            RETURNING id, booking_reference, patient_name`,
            [
                booking_reference, patient_name, patient_phone_processed, age, gender,
                medical_condition, hospital_name, hospitalIdsArray, // <--- Insert JS Array directly
                appointment_date, appointment_time,
                current_disposition, null, null, created_by_agent_id, last_interaction_date, 
                "Doctor referral", referee_id, created_at, created_at, panel
            ]
        );

        if (!newOPD.rows || newOPD.rows.length === 0) {
            throw new apiError(500, "Failed to create new OPD booking.");
        }

        const newOpdId = newOPD.rows[0].id;

        await logAudit(
            loggedInUser.id, 
            'CREATE_OPD_BOOKING_WEB', 
            'opd_booking', 
            newOpdId, 
            { 
                patientName: patient_name, 
                hospital: hospital_name, 
                hospitalIds: hospitalIdsArray 
            }
        );

        // --- 3. RESPOND TO CLIENT ---
        res.status(201).json(new apiResponse(201, newOPD.rows[0], `OPD Booking ${booking_reference} successfully created.`));

        // --- 4. BACKGROUND TASKS ---
        const runBackgroundTasks = async () => {
            let aadharDriveUrl = null;
            let pmjayDriveUrl = null;
            
            try {
                // --- Task B (WhatsApp) ---
                const notificationData = {
                    ...req.body,
                    hospital_ids: hospitalIdsArray, // Pass the array to notification util
                    booking_reference: newOPD.rows[0].booking_reference,
                    ndm_phone: ndm_contact_processed,
                    referee_phone: refree_phone_processed
                };
                await sendOpdNotifications(notificationData);

                // --- Task C: File Uploads ---
                const aadharFile = req.files?.aadhar_document?.[0];
                const pmjayFile = req.files?.pmjay_document?.[0];
                
                if (aadharFile) {
                    try {
                        const fileExt = path.extname(aadharFile.originalname) || '.jpg';
                        const aadharFileName = `${booking_reference}_aadhar${fileExt}`;
                        const links = await uploadAndGetLink(aadharFile.path, aadharFile.mimetype, aadharFileName);
                        aadharDriveUrl = links.directLink;
                    } catch(uploadErr) {
                        console.error(`Aadhar upload failed for ${newOpdId}:`, uploadErr.message);
                    } finally {
                        await fs.unlink(aadharFile.path); 
                    }
                }
                
                if (pmjayFile) {
                    try {
                        const fileExt = path.extname(pmjayFile.originalname) || '.jpg';
                        const pmjayFileName = `${booking_reference}_pmjay${fileExt}`;
                        const links = await uploadAndGetLink(pmjayFile.path, pmjayFile.mimetype, pmjayFileName);
                        pmjayDriveUrl = links.directLink;
                    } catch(uploadErr) {
                        console.error(`PMJAY upload failed for ${newOpdId}:`, uploadErr.message);
                    } finally {
                        await fs.unlink(pmjayFile.path);
                    }
                }

                // --- Task D: Update DB with URLs ---
                if (aadharDriveUrl || pmjayDriveUrl) {
                    await pool.query(
                        `UPDATE opd_bookings 
                         SET aadhar_card_url = $1, pmjay_card_url = $2, updated_at = NOW()
                         WHERE id = $3`,
                        [aadharDriveUrl, pmjayDriveUrl, newOpdId]
                    );
                }

                // --- Task A: Add to Google Sheet Queue ---
                const sheetRow = [
                    city, hospital_name, ndm_contact_processed, referee_name, 
                    refree_phone_no, patient_name, patient_phone, _age, gender, 
                    medical_condition, panel, 
                    aadharDriveUrl || "N/A", 
                    pmjayDriveUrl || "N/A", 
                    null, created_at, booking_reference, 
                    `${appointment_date} ${appointment_time}`, "Doctor referral", 
                    current_disposition, last_interaction_date
                ];
                await addToSheetQueue("OPD_BOOKING", sheetRow);

            } catch (backgroundError) {
                console.error("--- BACKGROUND TASK FAILED (OPD Booking) ---");
                console.error(backgroundError.message);
            }
        };
        
        runBackgroundTasks();
    });
    
    createPatientLeadBatchUpload = asyncHandler(async (req, res, next) => {
        const file = req.file;
        if (!file) throw new apiError(400, "No file uploaded.");

        const patientLeads = await readCsvFile(file.path);

        // Asynchronously delete the file, no need to wait
        fs.unlink(file.path, (err) => {
            if (err) {
                console.error('Error deleting temp file:', err);
            } else {
                console.log('Temp file deleted successfully:', file.path);
            }
        });

        // --- PHASE 1: PREPARATION ---
        const startTime = Date.now();
        const failedRows = [];
        const allRefreePhones = [];
        const allNdmContacts = [];

        // ***MODIFICATION***: We will collect full row arrays for valid rows
        const validRowsToInsert = [];

        // Collect all unique phones for bulk lookup outside the main loop
        for (const row of patientLeads) {
            if (row[4]) allRefreePhones.push(row[4]); // refree_phone_no
            if (row[2]) allNdmContacts.push(row[2]);   // ndm_contact
        }

        // --- PHASE 2: BULK LOOKUPS ---
        const [doctorMap, ndmMap] = await Promise.all([
            // 1. Bulk Lookup for Doctors (referee_id)
            (async () => {
                const map = {};
                if (allRefreePhones.length > 0) {
                    const placeholderList = allRefreePhones.map((_, i) => `$${i + 1}`).join(', ');
                    const doctorResult = await pool.query(
                        `SELECT id, phone FROM doctors WHERE phone IN (${placeholderList})`,
                        allRefreePhones
                    );
                    doctorResult.rows.forEach(row => map[row.phone] = row.id);
                }
                return map;
            })(),
            // 2. Bulk Lookup for NDM/Agents (created_by_agent_id)
            (async () => {
                const map = {};
                if (allNdmContacts.length > 0) {
                    const placeholderList = allNdmContacts.map((_, i) => `$${i + 1}`).join(', ');
                    const ndmResult = await pool.query(
                        `SELECT id, phone FROM users WHERE phone IN (${placeholderList})`,
                        allNdmContacts
                    );
                    ndmResult.rows.forEach(row => map[row.phone] = row.id);
                }
                return map;
            })()
        ]);

        // --- PHASE 3: LOOP, VALIDATE, AND COLLECT ---
        for (const i in patientLeads) {
            const row = patientLeads[i];
            const rowNumber = Number(i) + 2; // CSVs are 1-indexed, +1 for header

            try {
                // Data Extraction and Processing
                const hospital_name = processString(row[1]);
                const ndm_contact = row[2];
                const refree_phone_no = row[4];
                const patient_name = row[5];
                const patient_phone = process_phone_no(row[6]);
                const _age = row[7];
                let age = null;

                if (_age !== "N/A" && _age) {
                    const parsedAge = parseInt(_age, 10);
                    if (isNaN(parsedAge) || parsedAge < 0 || parsedAge > 120) {
                        console.log(`[Row ${rowNumber}]: Invalid or unrealistic Age value: ${_age}.`);
                    } else age = parsedAge;
                }

                const gender = row[8];
                const medical_condition = row[9];
                const panel = row[10]; // Maps to payment_mode
                const booking_reference = row[13];
                const tentative_visit_date = processTimeStamp(row[14]);
                const current_disposition = row[16];
                const patient_diposition_last_update = processTimeStamp(row[17]);

                // Lookups from local maps (O(1) complexity)
                const refree_id = doctorMap[refree_phone_no];
                const created_by_agent_id = ndmMap[ndm_contact];

                // Validation checks
                if (!refree_id) throw new Error(`Referee Doctor not found with phone: ${refree_phone_no}`);
                if (!created_by_agent_id) throw new Error(`NDM/Agent not found with phone: ${ndm_contact}`);
                if (!booking_reference || !hospital_name || !medical_condition || !patient_phone) {
                    throw new Error("Missing required fields: Booking Reference, Hospital, Medical Condition, or Patient Phone.");
                }
                
                const created_at = processTimeStamp(row[12]);
                const appointment_date = tentative_visit_date ? tentative_visit_date.split("T")[0] : null;

                // ***MODIFICATION***: Push a row array, not flat values
                validRowsToInsert.push([
                    booking_reference, patient_name, patient_phone, age, gender, medical_condition,
                    hospital_name, appointment_date, current_disposition, created_by_agent_id,
                    patient_diposition_last_update, "doctor", refree_id, created_at, created_at, panel
                ]);

            } catch (error) {
                console.error(`[Row ${rowNumber}]: FAILED with error: ${error.message}`);
                failedRows.push({ rowNumber: rowNumber, reason: error.message });
            }
        }

        // --- PHASE 4: BATCHED BULK INSERT ---
        let newlyCreatedCount = 0;

        const client = await pool.connect();

        try {
            if (validRowsToInsert.length > 0) {
                const columns = [
                    "booking_reference", "patient_name", "patient_phone", "age", "gender", "medical_condition",
                    "hospital_name", "appointment_date", "current_disposition", "created_by_agent_id",
                    "last_interaction_date", "source", "referee_id", "created_at", "updated_at", "payment_mode"
                ];
                const rowLength = columns.length; // 16 columns

                const BATCH_SIZE = 1000; 

                await client.query('BEGIN'); // Start the transaction

                console.log(`Starting batch insert for ${validRowsToInsert.length} valid rows in chunks of ${BATCH_SIZE}...`);

                for (let i = 0; i < validRowsToInsert.length; i += BATCH_SIZE) {
                    const batchRows = validRowsToInsert.slice(i, i + BATCH_SIZE);
                    const numRowsInBatch = batchRows.length;

                    const placeholderRows = [];
                    const batchValues = [];
                    let paramIndex = 1;

                    for (const row of batchRows) {
                        const rowPlaceholders = [];
                        for (const value of row) {
                            rowPlaceholders.push(`$${paramIndex++}`);
                            batchValues.push(value);
                        }
                        placeholderRows.push(`(${rowPlaceholders.join(', ')})`);
                    }

                    const valuePlaceholders = placeholderRows.join(', ');

                    const bulkInsertQuery = `
                    INSERT INTO opd_bookings (${columns.join(', ')}) 
                    VALUES ${valuePlaceholders}
                    RETURNING id
                `;

                    const result = await client.query(bulkInsertQuery, batchValues);
                    newlyCreatedCount += result.rowCount;

                    console.log(`Inserted batch ${Math.floor(i / BATCH_SIZE) + 1}, ${result.rowCount} new rows added.`);
                }

                await client.query('COMMIT'); // Commit the transaction
            }
        } catch (error) {
            await client.query('ROLLBACK'); // Roll back on error
            console.error("Error during batch insert transaction:", error);
            throw new apiError(500, "Database insertion failed. All changes have been rolled back.", [], error.stack);
        } finally {
            client.release(); // Always release the client
        }

        // --- FINAL TIME TRACKING ---
        const endTime = Date.now();
        const totalTimeSeconds = (endTime - startTime) / 1000;
        console.log(`\n--- Batch Processing Complete ---`);
        console.log(`Total rows in file: ${patientLeads.length}`);
        console.log(`Successfully validated: ${validRowsToInsert.length}, Failures (pre-check): ${failedRows.length}.`);
        console.log(`Newly inserted in DB: ${newlyCreatedCount}.`);
        console.log(`Total time: ${totalTimeSeconds.toFixed(2)} seconds.`);
        // ---------------------------

        res.status(201).json(new apiResponse(201, {
            total_rows: patientLeads.length,
            newly_created_count: newlyCreatedCount,
            failed_validation_count: failedRows.length,
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

        const logsToInsert = [];
        const failedRows = [];
        const uniqueCodes = [];
        const opdMap = {}; 
        const startTime = Date.now();

        for (const row of dispositionLogs) {
            if (row[0]) {
                uniqueCodes.push(row[0]);
            }
        }

        if (uniqueCodes.length === 0) {
            return res.status(201).json(new apiResponse(201, { newly_created_count: 0, failed_count: 0, failures: [] }, "No valid data to process."));
        }

        const placeholderList = uniqueCodes.map((_, i) => `$${i + 1}`).join(', ');

        const bulkOpdResult = await pool.query(
            `SELECT id, medical_condition, booking_reference FROM opd_bookings WHERE booking_reference IN (${placeholderList})`,
            uniqueCodes
        );

        bulkOpdResult.rows.forEach(row => {
            opdMap[row.booking_reference] = {
                id: row.id,
                medical_condition: row.medical_condition
            };
        });

        for (const i in dispositionLogs) {
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

                const opdData = opdMap[uniqueCode];

                if (!opdData) {
                    throw new Error(`OPD Booking not found for unique code: ${uniqueCode}`);
                }

                const created_at = processTimeStamp(timestampRaw);

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

        if (logsToInsert.length > 0) {
            const columns = [
                'opd_booking_id', 'previous_disposition', 'new_disposition',
                'disposition_reason', 'notes', 'created_at', 'updated_by_user_id'
            ];
            const rowLength = columns.length; // 7 columns per row

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

        const endTime = Date.now();
        const totalTimeSeconds = (endTime - startTime) / 1000;
        console.log(`\n--- Batch Processing Complete ---`);
        console.log(`Processed ${dispositionLogs.length} rows in ${totalTimeSeconds.toFixed(2)} seconds.`);
        console.log(`Successes: ${logsCreatedCount}, Failures: ${failedRows.length}.`);
        
        res.status(201).json(new apiResponse(201, {
            newly_created_count: logsCreatedCount,
            failed_count: failedRows.length,
            failures: failedRows
        }, "OPD Disposition Logs batch processing complete."));

    });
    
    updatePatientLead = asyncHandler(async (req, res, next) => {
        let {
            id, booking_reference, patient_name, patient_phone, age: _age,
            gender, medical_condition, hospital_name, tentative_visit_date,
            current_disposition, panel 
        } = req.body;

        if (!id && !booking_reference) {
            throw new apiError(400, "Provide either 'id' or 'booking_reference' to identify the booking for update.");
        }
        
        const identifier_key = id ? 'id' : 'booking_reference';
        const identifier_value = id ? id : booking_reference;

        let old_patient_phone = null;
        if (patient_phone) {
            try {
                const oldData = await pool.query(
                    `SELECT patient_phone FROM opd_bookings WHERE ${identifier_key} = $1`,
                    [identifier_value]
                );
                if (oldData.rows.length > 0) {
                    old_patient_phone = oldData.rows[0].patient_phone;
                }
            } catch (e) {
                console.error("Could not fetch old phone number for comparison.", e.message);
            }
        }

        const updated_at = new Date().toISOString();
        const updateFields = [];
        const queryParams = [];
        let paramIndex = 1;

        const addField = (value, dbColumn) => {
            if (value !== undefined && value !== null) {
                updateFields.push(`${dbColumn} = $${paramIndex++}`);
                queryParams.push(['patient_name', 'gender', 'medical_condition', 'hospital_name', 'current_disposition'].includes(dbColumn) ? processString(value) : value);
            }
        };

        addField(patient_name, 'patient_name');
        addField(gender, 'gender');
        addField(medical_condition, 'medical_condition');
        addField(hospital_name, 'hospital_name');
        addField(current_disposition, 'current_disposition');
        addField(panel, 'payment_mode');

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
            
            updateFields.push(`appointment_date = $${paramIndex++}`);
            queryParams.push(appointment_date);
        }

        updateFields.push(`updated_at = $${paramIndex++}`);
        queryParams.push(updated_at);

        if (updateFields.length === 1 && updateFields[0].includes('updated_at')) {
            throw new apiError(400, "No valid fields provided for update.");
        }

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
            RETURNING *
        `; 

        const updatedResult = await pool.query(updateQuery, queryParams);

        if (updatedResult.rowCount === 0) {
            throw new apiError(404, "OPD booking not found for update.");
        }
        
        const updatedRow = updatedResult.rows[0];

        if (req.user) {
            await logAudit(
                req.user.id,
                'PATIENT_UPDATE',
                'opd_booking',
                updatedRow.id,
                {
                    changedFields: updateFields, 
                    bookingRef: updatedRow.booking_reference
                }
            );
        }
        
        res.status(200).json(new apiResponse(200, {
             id: updatedRow.id,
             booking_reference: updatedRow.booking_reference,
             patient_name: updatedRow.patient_name,
             updated_at: updatedRow.updated_at
        }, "OPD booking successfully updated"));
        
        const runBackgroundTasks = async () => {
            try {
                const new_phone_updated = updatedRow.patient_phone;
                
                if (patient_phone && old_patient_phone && new_phone_updated !== old_patient_phone) {
                    
                    console.log(`Queueing phone number update for sheet: ${updatedRow.booking_reference}`);
                    await addToSheetQueue("UPDATE_PATIENT_PHONE", {
                        booking_reference: updatedRow.booking_reference,
                        new_phone: new_phone_updated
                    });

                    console.log(`Triggering Patient-Only notification for phone update: ${updatedRow.booking_reference}`);
                    
                    const qrPatientData = {
                        name: updatedRow.patient_name,
                        age: updatedRow.age || "N/A",
                        gender: updatedRow.gender || "N/A",
                        credits: "0", 
                        phoneNumber: updatedRow.patient_phone, 
                        uniqueCode: updatedRow.booking_reference,
                        timestamp: new Date().toISOString()
                    };

                    const qrCodeUrl = await fetchQrCodeUrl(qrPatientData);

                    if (qrCodeUrl) {
                        await sendAiSensy(
                            updatedRow.patient_phone,  
                            updatedRow.patient_name,   
                            qrCodeUrl                  
                        );
                        console.log(`Patient notification re-sent to new number: ${updatedRow.patient_phone}`);
                    } else {
                        console.error(`Skipping patient notification for ${updatedRow.booking_reference} because QR code generation failed.`);
                    }
                }
            } catch (backgroundError) {
                console.error("--- BACKGROUND TASK FAILED (Update Patient) ---");
                console.error(backgroundError.message);
            }
        };
        
        runBackgroundTasks();
    });
    
    deletePatientLead = asyncHandler(async (req, res, next) => {
        const { id, booking_reference } = req.body;

        if (!id && !booking_reference) {
            throw new apiError(400, "Provide id or booking reference of the OPD booking to delete");
        }
        
        let opdId;
        
        if (!id) {
             const opdResult = await pool.query("SELECT id FROM opd_bookings WHERE booking_reference = $1", [booking_reference]);
             if (opdResult.rows.length === 0) {
                 throw new apiError(404, "OPD booking not found or already deleted.");
             }
             opdId = opdResult.rows[0].id;
        } else {
            opdId = id;
        }

        await pool.query("DELETE FROM opd_dispositions_logs WHERE opd_booking_id = $1", [opdId]);

        const deleteResult = await pool.query(
            "DELETE FROM opd_bookings WHERE id = $1 RETURNING id, booking_reference",
            [opdId]
        );

        if (deleteResult.rowCount === 0) {
            throw new apiError(404, "OPD booking not found or already deleted.");
        }

        res.status(200).json(new apiResponse(200, deleteResult.rows[0], "OPD booking and its disposition logs successfully deleted"));
    });

    uploadOpdDocument = asyncHandler(async (req, res) => {
        const file = req.file;
        if (!file) {
            throw new apiError(400, "No file uploaded.");
        }

        try {
            const links = await uploadAndGetLink(file.path, file.mimetype);
            
            await fs.unlink(file.path);

            res.status(200).json(new apiResponse(
                200, 
                { url: links.directLink }, 
                "Document uploaded successfully"
            ));

        } catch (uploadError) {
            try { await fs.unlink(file.path); } catch (e) { /* ignore */ }
            
            console.error("Google Drive Upload Error:", uploadError);
            throw new apiError(500, "Failed to upload file to Google Drive.", [], uploadError.stack);
        }
    });

    getPatientPhoneByRef = asyncHandler(async (req, res) => {
        const { booking_reference } = req.params;
        if (!booking_reference) {
            throw new apiError(400, "Booking reference is required");
        }

        const result = await pool.query(
            "SELECT patient_phone FROM opd_bookings WHERE booking_reference = $1",
            [booking_reference]
        );

        if (result.rows.length === 0) {
            throw new apiError(404, "Patient not found with this unique ID.");
        }

        res.status(200).json(new apiResponse(
            200, 
            { patient_phone: result.rows[0].patient_phone }, 
            "Patient phone fetched"
        ));
    });

    getPatientDetailsByRef = asyncHandler(async (req, res) => {
        const { booking_reference } = req.params;
        if (!booking_reference) {
            throw new apiError(400, "Booking reference is required");
        }

        const query = `
            SELECT 
                booking_reference,
                patient_name,
                current_disposition,
                hospital_name, 
                hospital_ids   -- <--- ADDED: Fetch the IDs
            FROM crm.opd_bookings
            WHERE booking_reference = $1
        `;

        const result = await pool.query(query, [booking_reference]);

        if (result.rows.length === 0) {
            throw new apiError(404, "Patient not found with this unique ID.");
        }

        res.status(200).json(new apiResponse(
            200, 
            result.rows[0], 
            "Patient details fetched successfully"
        ));
    });

    updatePatientDisposition = asyncHandler(async (req, res) => {
        const { booking_reference, new_disposition, hospital_name, hospital_id, comments } = req.body;
        const userId = req.user.id;

        if (!booking_reference || !new_disposition) {
            throw new apiError(400, "Booking Reference and New Disposition are required.");
        }

        const client = await pool.connect();

        try {
            await client.query('BEGIN');

            // 1. Fetch current state AND details for notification (NDM, Referee, Patient info)
            // We join with users (for NDM phone) and doctors (for Referee info)
            const fetchQuery = `
                SELECT 
                    ob.id, 
                    ob.current_disposition, 
                    ob.patient_name,
                    ob.payment_mode,
                    u.phone AS ndm_phone,
                    d.first_name AS ref_first, 
                    d.last_name AS ref_last, 
                    d.phone AS ref_phone
                FROM opd_bookings ob
                LEFT JOIN users u ON ob.created_by_agent_id = u.id
                LEFT JOIN doctors d ON ob.referee_id = d.id
                WHERE ob.booking_reference = $1
            `;

            const currentRes = await client.query(fetchQuery, [booking_reference]);

            if (currentRes.rows.length === 0) {
                throw new apiError(404, "Booking not found.");
            }

            const row = currentRes.rows[0];
            const opdId = row.id;
            const prevDisposition = row.current_disposition;

            // 2. Insert into DB LOGS table
            await client.query(
                `INSERT INTO opd_dispositions_logs 
                (opd_booking_id, previous_disposition, new_disposition, notes, hospital_name, updated_by_user_id, created_at)
                VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
                [
                    opdId, 
                    prevDisposition, 
                    new_disposition, 
                    comments || '', 
                    hospital_name, 
                    userId
                ]
            );

            // 3. Update MAIN table 
            await client.query(
                `UPDATE opd_bookings 
                 SET current_disposition = $1, 
                     hospital_name = COALESCE($2, hospital_name),
                     hospital_ids = CASE 
                        WHEN $4::uuid IS NOT NULL THEN ARRAY[$4::uuid] 
                        ELSE hospital_ids 
                     END,
                     updated_at = NOW()
                 WHERE id = $3`,
                [new_disposition, hospital_name, opdId, hospital_id] 
            );

            await client.query('COMMIT');

            // --- 4. NOTIFICATIONS & LOGS ---
            
            // Prepare data for WhatsApp Notification
            const notificationData = {
                uniqueCode: booking_reference,
                name: row.patient_name,
                disposition: new_disposition,
                panel: row.payment_mode,
                ndmContact: req.user.phone, 
                refereeName: row.ref_first ? `${row.ref_first} ${row.ref_last || ''}`.trim() : null,
                refereeContactNumber: row.ref_phone
            };

            // Trigger Notification (Fire and forget)
            sendDispositionUpdateNotifications(notificationData).catch(err => 
                console.error("Background Notification Error:", err.message)
            );

            // Sheet Queue Sync
            const now = new Date();
            const monthName = now.toLocaleString('default', { month: 'long' });
            const sheetRow = [
                booking_reference,
                hospital_name || "N/A", 
                prevDisposition || "N/A",
                new_disposition,
                comments || "",
                now.toISOString(),
                monthName
            ];
            await addToSheetQueue("LOG_DISPOSITION_UPDATE", sheetRow);

            // Audit Log
            logAudit(userId, 'DISPOSITION_UPDATE', 'opd_booking', opdId, {
                old_status: prevDisposition,
                new_status: new_disposition,
                hospital_updated_to: hospital_name,
                hospital_id_updated: hospital_id
            });

            res.status(200).json(new apiResponse(200, {}, "Disposition and Hospital updated successfully."));

        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    });
}