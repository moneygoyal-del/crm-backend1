import apiError from "../utils/apiError.utils.js";
import apiResponse from "../utils/apiResponse.utils.js";
import asyncHandler from "../utils/asynchandler.utils.js";
import { process_phone_no, processTimeStamp, processString, convertDurationToMinutes, parseCallLogTimestamp} from "../helper/preprocess_data.helper.js";
import { pool } from "../DB/db.js";
import readCsvFile from "../helper/read_csv.helper.js";
import fs from "fs";
import { processDoctorName } from "../helper/process_doctor_name.helper.js";

export default class doctorController {
    // CREATE: Single entry doctor and meeting creation By NDM Name
    createDoctorByName = asyncHandler(async (req, res, next) => {
        const {
            ndm_name,
            doctor_name,
            doctor_phone_number,
            locality,
            duration_of_meeting,
            queries_by_the_doctor,
            comments_by_ndm,
            chances_of_getting_leads,
            clinic_image_link,
            selfie_image_link,
            gps_location_of_the_clinic,
            date_of_meeting,
            time_of_meeting,
            timestamp_of_the_meeting,
            latitude,
            longitude,
        } = req.body;
        if (!ndm_name || !doctor_phone_number) {
            throw new apiError(
                400,
                "ndm name and doctor phone number are compulsory"
            );
        }

        const timestamp = processTimeStamp(timestamp_of_the_meeting);

        const phone = process_phone_no(doctor_phone_number);

        if (!phone || !timestamp) {
            throw new apiError(400, "Invalid phone or timestamp");
        }

        const { firstName, lastName } = processDoctorName(doctor_name);
        const dr_name = firstName + " " + lastName;
        const fullName = dr_name.trim();

        const locationJson = JSON.stringify({
            locality: locality,
            latitude: latitude,
            longitude: longitude,
        });

        const existingDoctor = await pool.query(
            "SELECT id, onboarding_date, last_meeting FROM doctors WHERE phone = $1",
            [phone]
        );
        const NDM_name = ndm_name.trim().toLowerCase();
        const getNDM = await pool.query(
            "SELECT id FROM users WHERE first_name = $1 OR CONCAT(first_name,' ',last_name) = $1",
            [NDM_name]
        );

        if (getNDM.rows.length == 0)
            throw new apiError(404, "No ndm found with the name " + ndm_name);
        let NDM = getNDM?.rows[0]?.id;

        if (existingDoctor?.rows?.length > 0) {
            // UPDATE DOCTOR RECORD
            const doc = existingDoctor.rows[0];
            let newOnboarding =
                new Date(doc.onboarding_date) < timestamp
                    ? new Date(doc.onboarding_date)
                    : timestamp;
            let newLastMeeting =
                new Date(doc.last_meeting) > timestamp
                    ? new Date(doc.last_meeting)
                    : timestamp;
            if (doc.last_meeting > timestamp) {
                NDM = doc.assigned_agent_id_offline;
            }

            await pool.query(
                `UPDATE doctors SET onboarding_date = $1, last_meeting = $2, location = $3, gps_location_link = $4, updated_at = $6, assigned_agent_id_offline = $7 WHERE phone = $5`,
                [
                    newOnboarding,
                    newLastMeeting,
                    locationJson,
                    gps_location_of_the_clinic,
                    phone,
                    timestamp,
                    NDM,
                ]
            );
        } else {
            // INSERT NEW DOCTOR RECORD
            await pool.query(
                `INSERT INTO doctors (first_name, phone, location, gps_location_link, onboarding_date, last_meeting, assigned_agent_id_offline) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                [
                    fullName,
                    phone,
                    locationJson,
                    gps_location_of_the_clinic,
                    timestamp,
                    timestamp,
                    NDM,
                ]
            );
        }

        const doctor = await pool.query(
            "SELECT id FROM doctors WHERE phone = $1",
            [phone]
        );
        if (doctor?.rows[0]?.length == 0)
            throw new apiError(
                500,
                "Some error occured during doctor creation."
            );
        const photosJSON = JSON.stringify({
            clinicImage: clinic_image_link,
            selfieImage: selfie_image_link,
        });

        // INSERT NEW MEETING RECORD
        const meeting = await pool.query(
            "INSERT INTO doctor_meetings (doctor_id,agent_id,meeting_type,duration,location,gps_location_link,meeting_notes,photos,gps_verified,meeting_summary,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id,agent_id,doctor_id",
            [
                doctor?.rows[0]?.id,
                NDM,
                "physical",
                duration_of_meeting,
                locationJson,
                gps_location_of_the_clinic,
                queries_by_the_doctor,
                photosJSON,
                true,
                chances_of_getting_leads,
                timestamp,
                timestamp,
            ]
        );

        res.status(201).json(
            new apiResponse(
                201,
                meeting.rows[0],
                "Doctor and meeting successfully created"
            )
        );
    });

    // UPDATE: Single entry doctor update
    updateDoctor = asyncHandler(async (req, res, next) => {
        let {
            id,
            phone,
            first_name,
            last_name,
            location_locality,
            gps_location_link,
            status,
            assigned_agent_id_offline,
            assigned_agent_id_online,
        } = req.body;

        if (!id && !phone) {
            throw new apiError(
                400,
                "Provide either 'id' or 'phone' to identify the doctor for update."
            );
        }

        const updated_at = new Date().toISOString();
        const updateFields = [];
        const queryParams = [];
        let paramIndex = 1;

        // Helper function to add fields to update query
        const addField = (value, dbColumn) => {
            if (value !== undefined && value !== null) {
                updateFields.push(`${dbColumn} = $${paramIndex++}`);
                // Use processString for names and status
                queryParams.push(
                    ["first_name", "last_name", "status"].includes(dbColumn)
                        ? processString(value)
                        : value
                );
            }
        };

        addField(first_name, "first_name");
        addField(last_name, "last_name");
        addField(gps_location_link, "gps_location_link");
        addField(status, "status");
        addField(assigned_agent_id_offline, "assigned_agent_id_offline");
        addField(assigned_agent_id_online, "assigned_agent_id_online");

        // processing for phone (if being updated, requires validation)
        if (phone !== undefined && phone !== null) {
            updateFields.push(`phone = $${paramIndex++}`);

            queryParams.push(process_phone_no(phone));
        }

        // processing for location (JSONB column)
        if (
            location_locality !== undefined ||
            req.body.latitude !== undefined ||
            req.body.longitude !== undefined
        ) {
            const locationJson = JSON.stringify({
                locality: location_locality,
                latitude: req.body.latitude,
                longitude: req.body.longitude,
            });
            updateFields.push(`location = $${paramIndex++}`);
            queryParams.push(locationJson);
        }

        // Add mandatory updated_at field
        updateFields.push(`updated_at = $${paramIndex++}`);
        queryParams.push(updated_at);

        // Check if there's anything to update besides the timestamp
        if (updateFields.length <= 1) {
            throw new apiError(400, "No valid fields provided for update.");
        }

        // Build WHERE clause
        let whereClause;
        if (id) {
            whereClause = `id = $${paramIndex++}`;
            queryParams.push(id);
        } else {
            // Use the phone number from the request body as the identifier in the WHERE clause
            whereClause = `phone = $${paramIndex++}`;
            queryParams.push(process_phone_no(phone));
        }

        const updateQuery = `
            UPDATE doctors 
            SET ${updateFields.join(", ")} 
            WHERE ${whereClause}
            RETURNING id, phone, first_name, last_name, updated_at
        `;

        const updatedResult = await pool.query(updateQuery, queryParams);

        if (updatedResult.rowCount === 0) {
            throw new apiError(404, "Doctor not found for update.");
        }

        res.status(200).json(
            new apiResponse(
                200,
                updatedResult.rows[0],
                "Doctor successfully updated"
            )
        );
    });

    // DELETE: Single entry doctor deletion
    deleteDoctor = asyncHandler(async (req, res, next) => {
        const { id, phone } = req.body;

        if (!id && !phone) {
            throw new apiError(
                400,
                "Provide id or phone number of the doctor to delete"
            );
        }

        let doctorId;

        if (id) {
            doctorId = id;
        } else {
            const processedPhone = process_phone_no(phone);
            const doctorResult = await pool.query(
                "SELECT id FROM doctors WHERE phone = $1",
                [processedPhone]
            );
            if (doctorResult.rows.length === 0) {
                throw new apiError(404, "Doctor not found.");
            }
            doctorId = doctorResult.rows[0].id;
        }

        // 1. Delete dependent records (doctor_meetings)
        // Note: This is required because doctor_meetings has a foreign key constraint on doctors(id)
        await pool.query("DELETE FROM doctor_meetings WHERE doctor_id = $1", [
            doctorId,
        ]);

        // 2. Delete the doctor record
        const deleteResult = await pool.query(
            "DELETE FROM doctors WHERE id = $1 RETURNING id, phone, first_name",
            [doctorId]
        );

        if (deleteResult.rowCount === 0) {
            throw new apiError(404, "Doctor not found or failed to delete.");
        }

        res.status(200).json(
            new apiResponse(
                200,
                deleteResult.rows[0],
                "Doctor and related meetings successfully deleted"
            )
        );
    });

   
    // BATCH: Create Doctor Batch and Meetings 
    createDoctorBatchAndMeetings = asyncHandler(async (req, res, next) => {
    const file = req.file;
    if (!file) throw new apiError(400, "No file uploaded.");

    const doctorsCsvData = await readCsvFile(file.path);

    fs.unlink(file.path, (err) => {
        if (err) {
            console.error('Error deleting file:', err);
        } else {
            console.log('File deleted successfully:', file.path);
        }
    });

    const startTime = Date.now();
    const allNDMNames = new Set();
    const allDoctorPhones = new Set();
    const rowsToProcess = [];
    const failedRows = [];

    // --- PASS 1: INITIAL VALIDATION & COLLECTION (NO DB INTERACTION) ---
    for (let i = 0; i < doctorsCsvData.length; i++) {
        const row = doctorsCsvData[i];
        const rowNumber = i + 2;

        try {
            if (!row || row.length < 17) throw new Error("Row is empty or has too few columns");

            const FullName = row[1];
            const phoneRaw = row[2];
            const ndm_name = row[0];
            
            const timestamp = processTimeStamp(row[17] + " " + row[16]); // date + time
            const phone = process_phone_no(phoneRaw);

            if (!FullName || !phone || !timestamp || !ndm_name) throw new Error("Missing Name, Phone, NDM Name, or timestamp");

            allDoctorPhones.add(phone);
            allNDMNames.add(ndm_name.trim().toLowerCase());
            rowsToProcess.push({ row, rowNumber, timestamp, phone });
        } catch (error) {
            failedRows.push({ rowNumber, reason: error.message });
        }
    }
    
    if (rowsToProcess.length === 0) {
        return res.status(201).json(new apiResponse(201, { newly_created_count: 0, updated_count: 0, failed_count: failedRows.length, failures: failedRows }, "Batch processing complete (no valid data)."));
    }


    // --- PASS 2: BULK LOOKUPS (MINIMAL DB QUERIES) ---
    
    // 1. Bulk NDM Lookup: Fetch all NDM IDs needed in ONE query
    const ndmMap = {}; // {name: id}
    const ndmPlaceholder = Array.from(allNDMNames).map((_, i) => `$${i + 1}`).join(',');
    const ndmResult = await pool.query(`SELECT id, first_name, last_name FROM users WHERE first_name IN (${ndmPlaceholder}) OR CONCAT(first_name,' ',last_name) IN (${ndmPlaceholder})`, Array.from(allNDMNames));
    
    ndmResult.rows.forEach(r => {
        const fullName = (r.first_name + (r.last_name ? ' ' + r.last_name : '')).trim().toLowerCase();
        ndmMap[r.first_name.toLowerCase()] = r.id;
        ndmMap[fullName] = r.id;
    });

    // 2. Bulk Doctor Lookup: Fetch all existing doctors in ONE query
    const doctorPlaceholder = Array.from(allDoctorPhones).map((_, i) => `$${i + 1}`).join(',');
    const doctorResult = await pool.query(`SELECT id, phone, onboarding_date, last_meeting, assigned_agent_id_offline FROM doctors WHERE phone IN (${doctorPlaceholder})`, Array.from(allDoctorPhones));
    const doctorMap = {}; // {phone: {id, ...}}
    doctorResult.rows.forEach(r => doctorMap[r.phone] = r);


    // --- PASS 3: LOCAL PROCESSING & COLLECTING FINAL DATA ---
    
    const newDoctorInserts = []; 
    const updateDoctorUpdates = []; 
    const meetingsToInsert = [];    
    const createdDoctorIds = {};    // {phone: id or placeholder}
    
    let processedDoctorsCount = 0;
    let updatedDoctorsCount = 0;

    for (const { row, rowNumber, timestamp, phone } of rowsToProcess) {
        try {
            const ndm_name = row[0].trim().toLowerCase();
            const NDM_id = ndmMap[ndm_name];

            if (!NDM_id) { 
                throw new Error(`NDM '${row[0]}' not found after lookup.`); 
            }

            const { firstName, lastName } = processDoctorName(row[1]);
            const fullName = `${firstName} ${lastName}`.trim();
            const locationJson = JSON.stringify({ locality: row[3], latitude: row[18], longitude: row[19] });
            const gps_location_link = row[14];
            const photosJSON = JSON.stringify({ clinicImage: row[12], selfieImage: row[13] });
            const duration = row[6];
            const meeting_notes = row[8];
            const meeting_summary = row[11];
            
            const existingDoc = doctorMap[phone];

            if (existingDoc) {
                // UPDATE DOCTOR: Prepare data for parallel execution
                let NDM = existingDoc.assigned_agent_id_offline;
                let newOnboarding = new Date(existingDoc.onboarding_date) < timestamp ? existingDoc.onboarding_date : timestamp;
                let newLastMeeting = new Date(existingDoc.last_meeting) > timestamp ? existingDoc.last_meeting : timestamp;
                
                if (new Date(existingDoc.last_meeting) <= timestamp) NDM = NDM_id; 
                
                updateDoctorUpdates.push({
                    query: `UPDATE doctors SET onboarding_date = $1, last_meeting = $2, location = $3, gps_location_link = $4, updated_at = $6, assigned_agent_id_offline = $7 WHERE phone = $5`,
                    params: [newOnboarding, newLastMeeting, locationJson, gps_location_link, phone, timestamp, NDM],
                });
                createdDoctorIds[phone] = existingDoc.id;
                updatedDoctorsCount++;

            } else {
                // NEW DOCTOR: Collect data for bulk INSERT
                const doctorIdPlaceholder = 'NEW_ID_' + phone; 
                newDoctorInserts.push(
                    fullName, phone, locationJson, gps_location_link, timestamp, timestamp, NDM_id
                );
                createdDoctorIds[phone] = doctorIdPlaceholder; 
                processedDoctorsCount++;
            }
            
            // Collect meeting data, using ID placeholder for new doctors
            meetingsToInsert.push({
                doctorId: createdDoctorIds[phone], 
                NDM_id, duration, locationJson, gps_location_link, meeting_notes, photosJSON, meeting_summary, timestamp
            });
            
        } catch (error) {
            failedRows.push({ rowNumber, reason: error.message });
            console.error(`[Row ${rowNumber}]: FAILED during local processing: ${error.message}`);
        }
    }
    
    
    // --- PASS 4: FINAL DATABASE WRITES (ASYNCHRONOUSLY) ---
    
    // 1. Execute parallel Doctor UPDATES (for existing doctors)
    const updatePromises = updateDoctorUpdates.map(u => pool.query(u.query, u.params));
    await Promise.all(updatePromises);
    
    // 2. Execute BULK INSERT for NEW Doctors and get their new IDs
    let insertedDoctorIds = {}; // {phone: actual_uuid}
    if (newDoctorInserts.length > 0) {
        const columns = ['first_name', 'phone', 'location', 'gps_location_link', 'onboarding_date', 'last_meeting', 'assigned_agent_id_offline'];
        const rowLength = columns.length; 
        
        const valuePlaceholders = newDoctorInserts
            .map((_, i) => i + 1)
            .reduce((acc, v, i) => {
                if (i % rowLength === 0) {
                    const placeholders = Array.from({ length: rowLength }, (_, j) => `$${v + j}`).join(', ');
                    acc.push(`(${placeholders})`);
                }
                return acc;
            }, [])
            .join(', ');

        const newDoctorResult = await pool.query(`INSERT INTO doctors (${columns.join(', ')}) VALUES ${valuePlaceholders} RETURNING id, phone`, newDoctorInserts);
        newDoctorResult.rows.forEach(r => { insertedDoctorIds[r.phone] = r.id; });
    }

    // 3. Prepare Meeting data with FINAL IDs
    const finalMeetingsToInsert = [];
    meetingsToInsert.forEach(m => {
        const phone = m.doctorId.replace('NEW_ID_', '');
        const doctorId = m.doctorId.startsWith('NEW_ID_') 
                         ? insertedDoctorIds[phone] // Use the newly inserted UUID
                         : m.doctorId; // Use the existing UUID

        if (doctorId) {
            finalMeetingsToInsert.push(
                doctorId, m.NDM_id, "physical", m.duration, m.locationJson, m.gps_location_link,
                m.meeting_notes, m.photosJSON, true, m.meeting_summary, m.timestamp, m.timestamp
            );
        }
    });

    // 4. Execute BULK INSERT for Meetings
    let meetingCount = 0;
    if (finalMeetingsToInsert.length > 0) {
        const columns = ['doctor_id', 'agent_id', 'meeting_type', 'duration', 'location', 'gps_location_link', 'meeting_notes', 'photos', 'gps_verified', 'meeting_summary', 'created_at', 'updated_at'];
        const rowLength = columns.length; 
        
        const valuePlaceholders = finalMeetingsToInsert
            .map((_, i) => i + 1)
            .reduce((acc, v, i) => {
                if (i % rowLength === 0) {
                    const placeholders = Array.from({ length: rowLength }, (_, j) => `$${v + j}`).join(', ');
                    acc.push(`(${placeholders})`);
                }
                return acc;
            }, [])
            .join(', ');

        const result = await pool.query(`INSERT INTO doctor_meetings (${columns.join(', ')}) VALUES ${valuePlaceholders}`, finalMeetingsToInsert);
        meetingCount = result.rowCount;
    }

    // --- FINAL TIME TRACKING AND RESPONSE ---
    const endTime = Date.now();
    const totalTimeSeconds = (endTime - startTime) / 1000;
    
    console.log(`\n--- Batch Processing Complete ---`);
    console.log(`Processed ${doctorsCsvData.length} total rows in ${totalTimeSeconds.toFixed(2)} seconds.`);
    console.log(`Successes: ${processedDoctorsCount} inserted, ${updatedDoctorsCount} updated, ${meetingCount} meetings. Failures: ${failedRows.length}.`);

    res.status(201).json(new apiResponse(201, {
        newly_created_count: processedDoctorsCount,
        updated_count: updatedDoctorsCount,
        failed_count: failedRows.length,
        failures: failedRows
    }, "Batch processing complete."));
    });

    // BATCH: Create Online Doctors 
    createOnlineDoctors = asyncHandler(async (req, res, next) => {
    const file = req.file;
    const ndmPhoneRaw = req.params.ndmPhone;

    if (!file) throw new apiError(400, "No file uploaded.");
    if (!ndmPhoneRaw) throw new apiError(400, "NDM phone number is required.");

    const ndmPhone = process_phone_no(ndmPhoneRaw);
    if (!ndmPhone) throw new apiError(400, "Invalid NDM phone number format.");

    // 1. Find the NDM's ID (Single Query - already efficient)
    const ndmResult = await pool.query("SELECT id FROM users WHERE phone = $1", [ndmPhone]);
    if (ndmResult.rows.length === 0) throw new apiError(404, `NDM with phone ${ndmPhone} not found.`);
    const ndmId = ndmResult.rows[0].id;
    
    const doctorsCsvData = await readCsvFile(file.path);

    fs.unlink(file.path, (err) => {
        if (err) {
            console.error('Error deleting file:', err);
        } else {
            console.log('File deleted successfully:', file.path);
        }
    });
    
    const startTime = Date.now();
    const allDoctorPhones = new Set();
    const rowsToProcess = [];
    const failedRows = [];

    // --- PASS 1: INITIAL VALIDATION & COLLECTION ---
    for (let i = 0; i < doctorsCsvData.length; i++) {
        const row = doctorsCsvData[i];
        const rowNumber = i + 2;

        try {
            const doctorName = row[0];
            const doctorPhoneRaw = row[1];

            if (!doctorName || !doctorPhoneRaw) throw new Error("Missing Doctor Name or Doctor Phone.");
            const doctorPhone = process_phone_no(doctorPhoneRaw);
            if (!doctorPhone) throw new Error("Invalid phone number format.");

            allDoctorPhones.add(doctorPhone);
            rowsToProcess.push({ row, rowNumber, doctorName, doctorPhone, location: row[2] });
        } catch (error) {
            failedRows.push({ rowNumber, reason: error.message });
        }
    }
    
    // --- PASS 2: BULK DOCTOR LOOKUP ---
    const doctorMap = {}; // {phone: id}
    if (allDoctorPhones.size > 0) {
        const doctorPhonesArray = Array.from(allDoctorPhones);
        const placeholderList = doctorPhonesArray.map((_, i) => `$${i + 1}`).join(',');
        const doctorResult = await pool.query(`SELECT id, phone FROM doctors WHERE phone IN (${placeholderList})`, doctorPhonesArray);
        doctorResult.rows.forEach(r => doctorMap[r.phone] = r.id);
    }

    // --- PASS 3: LOCAL PROCESSING & COLLECTING FINAL DATA ---
    const newDoctorInserts = []; 
    const updateDoctorUpdates = []; // {id, phone, ndmId}
    
    let newlyCreatedCount = 0;
    let updatedCount = 0;

    for (const { rowNumber, doctorName, doctorPhone, location } of rowsToProcess) {
        try {
            const existingId = doctorMap[doctorPhone];
            const { firstName, lastName } = processDoctorName(doctorName);
            const fullName = `${firstName} ${lastName}`.trim();
            const locationJson = JSON.stringify({ locality: location });

            if (existingId) {
                // Collect update data for parallel execution
                updateDoctorUpdates.push({ id: existingId, phone: doctorPhone, ndmId: ndmId });
                updatedCount++;
            } else {
                // Collect new insert data for bulk INSERT
                newDoctorInserts.push(fullName, doctorPhone, locationJson, ndmId);
                newlyCreatedCount++;
            }
        } catch (error) {
            failedRows.push({ rowNumber, reason: error.message });
        }
    }
    
    // --- PASS 4: FINAL DATABASE WRITES (ASYNCHRONOUSLY) ---
    
    // 1. Execute parallel Doctor UPDATES (to set assigned_agent_id_online)
    const updatePromises = updateDoctorUpdates.map(u => 
        pool.query("UPDATE doctors SET assigned_agent_id_online = $1, updated_at = NOW() WHERE id = $2", [u.ndmId, u.id])
    );
    await Promise.all(updatePromises);
    
    // 2. Execute BULK INSERT for NEW Doctors
    if (newDoctorInserts.length > 0) {
        const columns = ['first_name', 'phone', 'location', 'assigned_agent_id_online'];
        const rowLength = columns.length; 
        
        const valuePlaceholders = newDoctorInserts
            .map((_, i) => i + 1)
            .reduce((acc, v, i) => {
                if (i % rowLength === 0) {
                    const placeholders = Array.from({ length: rowLength }, (_, j) => `$${v + j}`).join(', ');
                    acc.push(`(${placeholders})`);
                }
                return acc;
            }, [])
            .join(', ');

        const bulkInsertQuery = `INSERT INTO doctors (${columns.join(', ')}) VALUES ${valuePlaceholders}`;
        await pool.query(bulkInsertQuery, newDoctorInserts);
    }

    // --- FINAL TIME TRACKING AND RESPONSE ---
    const endTime = Date.now();
    const totalTimeSeconds = (endTime - startTime) / 1000;
    
    console.log(`\n--- Batch Processing Complete ---`);
    console.log(`Processed ${doctorsCsvData.length} total rows in ${totalTimeSeconds.toFixed(2)} seconds.`);
    console.log(`Successes: ${newlyCreatedCount} inserted, ${updatedCount} updated. Failures: ${failedRows.length}.`);

    res.status(201).json(new apiResponse(201, {
        newly_created_count: newlyCreatedCount,
        updated_count: updatedCount,
        failed_count: failedRows.length,
        failures: failedRows
    }, "--- Batch Processing Complete ---"));
    });

    deleteDoctorMeeting = asyncHandler(async (req, res, next) => {
        const { id } = req.body;

        if (!id) {
            throw new apiError(400, "Provide id of the meeting to delete");
        }

        const deleteDoctorMeeting = await pool.query(
            "DELETE FROM DOCTOR_MEETINGS WHERE ID = $1",
            [id]
        );
        console.log(deleteDoctorMeeting);
        if (deleteDoctorMeeting?.rowCount == 0) {
            throw new apiError(500, "Failed to delete user");
        }

        res.status(200).json(
            new apiResponse(200, {}, "Doctor successfully deleted")
        );
    });

     //BATCH: Create Doctor Call Logs (Batch Upload of Call Logs)
    createDoctorCallLogBatch = asyncHandler(async (req, res, next) => {
        const file = req.file;
        if (!file) throw new apiError(400, "No file uploaded.");

        const doctorsCallLogs = await readCsvFile(file.path);

        fs.unlink(file.path, (err) => {
            if (err) {
                console.error('Error deleting file:', err);
            } else {
                console.log('File deleted successfully:', file.path);
            }
        });

        const startTime = Date.now();
        const failedRows = [];
        const rowsToProcess = [];
        const allDoctorPhones = new Set();
        const allAgentPhones = new Set();
        
        // --- PASS 1: INITIAL DATA COLLECTION & VALIDATION (NO DB) ---
        for (let i = 0; i < doctorsCallLogs.length; i++) {
            const row = doctorsCallLogs[i];
            const rowNumber = i + 2;

            try {
                // CORRECTED INDEX: Customer Phone is row[2]. SF Number is row[11].
                const doctorPhoneRaw = row[2]; 
                const agentPhoneRaw = row[11]; 
                const startTimeRaw = row[9];
                
                if (!doctorPhoneRaw || !agentPhoneRaw) {
                    throw new Error("Missing Doctor Phone or SF Number.");
                }
                
                let doctorPhone;
                let agentPhone;

                // 1. Check for Invalid Phone Number format (Throws "Provide a valid phone number")
                try {
                    doctorPhone = process_phone_no(doctorPhoneRaw);
                    agentPhone = process_phone_no(agentPhoneRaw);
                } catch (phoneError) {
                    throw new Error("Provide a valid phone number");
                }
                
                // 2. Check for Invalid Time Value using local custom parser
                const timestamp = parseCallLogTimestamp(startTimeRaw);
                
                if (!timestamp) {
                     throw new Error("Invalid time value");
                }
                
                allDoctorPhones.add(doctorPhone);
                allAgentPhones.add(agentPhone);
                rowsToProcess.push({ row, rowNumber, doctorPhone, agentPhone, timestamp });

            } catch (error) {
                failedRows.push({ rowNumber, reason: error.message });
                console.error(`[Row ${rowNumber}]: FAILED during local validation: ${error.message}`);
            }
        }

        if (rowsToProcess.length === 0) {
            return res.status(201).json(new apiResponse(201, { newly_created_count: 0, failed_count: failedRows.length, failures: failedRows }, "Batch processing complete (no valid data)."));
        }


        // --- PASS 2: BULK LOOKUPS (MINIMAL DB QUERIES) ---
        
        const doctorMap = {}; // {phone: id}
        if (allDoctorPhones.size > 0) {
            const doctorPhonesArray = Array.from(allDoctorPhones);
            const placeholderList = doctorPhonesArray.map((_, i) => `$${i + 1}`).join(',');
            const doctorResult = await pool.query(`SELECT id, phone FROM doctors WHERE phone IN (${placeholderList})`, doctorPhonesArray);
            doctorResult.rows.forEach(r => doctorMap[r.phone] = r.id);
        }

        const userMap = {}; // {phone: id}
        if (allAgentPhones.size > 0) {
            const userPhonesArray = Array.from(allAgentPhones);
            const placeholderList = userPhonesArray.map((_, i) => `$${i + 1}`).join(',');
            const userResult = await pool.query(`SELECT id, phone FROM users WHERE phone IN (${placeholderList})`, userPhonesArray);
            userResult.rows.forEach(r => userMap[r.phone] = r.id);
        }


        // --- PASS 3: LOCAL PROCESSING & FINAL FILTERING ---
        
        const finalMeetingsToInsert = []; 
        let successfulRowsCount = 0;

        for (const { row, rowNumber, doctorPhone, agentPhone, timestamp } of rowsToProcess) {
            try {
                const doctorId = doctorMap[doctorPhone];
                const agentId = userMap[agentPhone];

                // Primary Filtering: Doctor must be registered
                if (!doctorId) {
                    throw new Error(`Skipped: Phone number ${doctorPhone} is not a registered Doctor.`);
                }
                
                // Secondary Filtering: Agent must be registered
                if (!agentId) {
                    throw new Error(`Agent not found for SF Number: ${agentPhone}.`);
                }

                // CSV Column Indices: Call Status: [6], Duration: [7]
                const callStatus = row[6];       
                const durationString = row[7];
                
                const durationMinutes = convertDurationToMinutes(durationString);
                
                // Collect meeting data for bulk INSERT
                finalMeetingsToInsert.push(
                    doctorId, 
                    agentId, 
                    "call",                      
                    durationMinutes, 
                    null,                        
                    null,                        
                    null,                        
                    null,                        
                    false,                       
                    callStatus,                 
                    timestamp, 
                    timestamp
                );
                successfulRowsCount++;
            } catch (error) {
                // Log filtering errors that occurred during processing
                failedRows.push({ rowNumber, reason: error.message });
                console.error(`[Row ${rowNumber}]: FAILED during filtering: ${error.message}`);
            }
        }
        
        
        // --- PASS 4: FINAL DATABASE WRITES (BULK INSERT) ---
        
        let meetingCount = 0;
        if (finalMeetingsToInsert.length > 0) {
            const columns = ['doctor_id', 'agent_id', 'meeting_type', 'duration', 'location', 'gps_location_link', 'meeting_notes', 'photos', 'gps_verified', 'meeting_summary', 'created_at', 'updated_at'];
            const rowLength = columns.length; 
            
            const valuePlaceholders = finalMeetingsToInsert
                .map((_, i) => i + 1)
                .reduce((acc, v, i) => {
                    if (i % rowLength === 0) {
                        const placeholders = Array.from({ length: rowLength }, (_, j) => `$${v + j}`).join(', ');
                        acc.push(`(${placeholders})`);
                    }
                    return acc;
                }, [])
                .join(', ');

            try {
                const result = await pool.query(`INSERT INTO doctor_meetings (${columns.join(', ')}) VALUES ${valuePlaceholders}`, finalMeetingsToInsert);
                meetingCount = result.rowCount;
                
            } catch (dbError) {
                 console.error("\nCRITICAL BULK INSERT FAILURE:", dbError.message);
                 // Clear successful count and add all attempted rows as failed
                 meetingCount = 0; 
                 const failedInsertCount = finalMeetingsToInsert.length / rowLength;
                 for (let i = 0; i < failedInsertCount; i++) {
                     failedRows.push({ rowNumber: `Successful data block ${i + 1}`, reason: `Critical DB failure on bulk insert: ${dbError.message.substring(0, 100)}...` });
                 }
            }
        }

        // --- FINAL TIME TRACKING AND RESPONSE ---
        const endTime = Date.now();
        const totalTimeSeconds = (endTime - startTime) / 1000;
        
        console.log(`\n--- Batch Processing Complete ---`);
        console.log(`Processed ${doctorsCallLogs.length} total rows in ${totalTimeSeconds.toFixed(2)} seconds.`);
        console.log(`Successes: ${meetingCount} meetings created. Failures: ${failedRows.length}.`);

        res.status(201).json(new apiResponse(201, {
            newly_created_count: meetingCount,
            failed_count: failedRows.length,
            failures: failedRows
        }, "Call Logs batch processing complete."));
    });

}
