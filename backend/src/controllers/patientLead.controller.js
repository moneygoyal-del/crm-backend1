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

        if (!tentative_visit_date) {
            throw new apiError(400, "Invalid Tentative Visit Date format.");
        }
        const appointment_date = tentative_visit_date.split("T")[0];

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

    // --- BATCH UPLOAD OPD BOOKINGS ---
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
                if (!tentative_visit_date) throw new Error("Invalid Tentative Visit Date format.");

                const created_at = processTimeStamp(row[12]);
                const appointment_date = tentative_visit_date.split("T")[0];

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

        // ***MODIFICATION***: Use a transaction for all batches
        const client = await pool.connect();

        try {
            if (validRowsToInsert.length > 0) {
                const columns = [
                    "booking_reference", "patient_name", "patient_phone", "age", "gender", "medical_condition",
                    "hospital_name", "appointment_date", "current_disposition", "created_by_agent_id",
                    "last_interaction_date", "source", "referee_id", "created_at", "updated_at", "payment_mode"
                ];
                const rowLength = columns.length; // 16 columns

                // Define a batch size well under the limit
                const BATCH_SIZE = 1000; // 1000 rows * 16 cols = 16,000 params (safe)

                await client.query('BEGIN'); // Start the transaction

                console.log(`Starting batch insert for ${validRowsToInsert.length} valid rows in chunks of ${BATCH_SIZE}...`);

                for (let i = 0; i < validRowsToInsert.length; i += BATCH_SIZE) {
                    const batchRows = validRowsToInsert.slice(i, i + BATCH_SIZE);
                    const numRowsInBatch = batchRows.length;

                    // Dynamically generate placeholders for this batch
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
                    // Note: Added "ON CONFLICT... DO NOTHING" as an example of conflict handling.
                    // Remove it if "booking_reference" is not unique or if you want it to fail.

                    // Use the transactional client to run the query
                    const result = await client.query(bulkInsertQuery, batchValues);
                    newlyCreatedCount += result.rowCount;

                    console.log(`Inserted batch ${Math.floor(i / BATCH_SIZE) + 1}, ${result.rowCount} new rows added.`);
                }

                await client.query('COMMIT'); // Commit the transaction
            }
        } catch (error) {
            await client.query('ROLLBACK'); // Roll back on error
            console.error("Error during batch insert transaction:", error);
            // Throw a generic error to be caught by asyncHandler
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