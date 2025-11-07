import apiError from "../utils/apiError.utils.js";
import apiResponse from "../utils/apiResponse.utils.js";
import asyncHandler from "../utils/asynchandler.utils.js";
import { process_phone_no, processTimeStamp, processString, convertDurationToMinutes, parseCallLogTimestamp} from "../helper/preprocess_data.helper.js";
import { pool } from "../DB/db.js";
import readCsvFile from "../helper/read_csv.helper.js";
import fs from "fs";
import { processDoctorName } from "../helper/process_doctor_name.helper.js";
import { addToSheetQueue } from "../utils/sheetQueue.util.js"; // <-- USE THE QUEUE

export default class doctorController {
    // --- THIS IS YOUR ORIGINAL FUNCTION (UNCHANGED) ---
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

    createOpdBookingFromWeb = asyncHandler(async (req, res, next) => {
        // Get user info from the JWT token
        const loggedInUser = req.user; 
        if (!loggedInUser) {
            throw new apiError(401, "User not authenticated");
        }
        
        // 1. Destructure ALL fields from the form
        let {
            hospital_name, refree_phone_no, referee_name, patient_name, patient_phone,
            city, age: _age, gender, medical_condition, panel,
            booking_reference, appointment_date, appointment_time,
            current_disposition
        } = req.body;

        // --- Data Processing and Validation ---
        hospital_name = processString(hospital_name);

        if (!refree_phone_no || !patient_name || !patient_phone || !medical_condition || !hospital_name || !booking_reference || !appointment_date || !appointment_time) {
            throw new apiError(400, "Missing required fields. Check all fields with *.");
        }

        const ndm_contact_processed = process_phone_no(loggedInUser.phone);
        const ndm_name = loggedInUser.first_name;
        
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
        const newOPD = await pool.query(
            `INSERT INTO opd_bookings (
                booking_reference, patient_name, patient_phone, age, gender, 
                medical_condition, hospital_name, appointment_date, appointment_time, 
                current_disposition, created_by_agent_id, last_interaction_date, 
                source, referee_id, created_at, updated_at, payment_mode
            ) 
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17) 
            RETURNING id, booking_reference, patient_name`,
            [
                booking_reference, patient_name, patient_phone_processed, age, gender,
                medical_condition, hospital_name, appointment_date, appointment_time,
                current_disposition, created_by_agent_id, last_interaction_date,
                "Doctor referral", referee_id, created_at, created_at, panel
            ]
        );

        if (!newOPD.rows || newOPD.rows.length === 0) {
            throw new apiError(500, "Failed to create new OPD booking.");
        }

        // --- 3. RESPOND TO CLIENT (FAST) ---
        // We send the success response *before* running background tasks.
        res.status(201).json(new apiResponse(201, newOPD.rows[0], `OPD Booking ${booking_reference} successfully created.`));

        // --- 4. RUN BACKGROUND TASKS SAFELY ---
        // We create a new async function and call it without 'await'.
        // This 'detaches' it from the main request, so its errors
        // won't be caught by the asyncHandler.
        const runBackgroundTasks = async () => {
            try {
                // --- Task A: Add to Google Sheet Queue ---
                const sheetRow = [
                    city, hospital_name, ndm_contact_processed, referee_name, 
                    refree_phone_no, patient_name, patient_phone, _age, gender, 
                    medical_condition, panel, null, created_at, booking_reference, 
                    `${appointment_date} ${appointment_time}`, "Doctor referral", 
                    current_disposition, last_interaction_date
                ];
                await addToSheetQueue("OPD_BOOKING", sheetRow);

                // --- Task B: Trigger WhatsApp Notifications ---
                const notificationData = {
                    ...req.body, // Use all form data
                    booking_reference: newOPD.rows[0].booking_reference,
                    ndm_phone: ndm_contact_processed,
                    referee_phone: refree_phone_processed
                };
                await sendOpdNotifications(notificationData);

            } catch (backgroundError) {
                // If any background task fails, we just log it.
                // We DON'T throw, so it won't crash the server.
                console.error("--- BACKGROUND TASK FAILED (OPD Booking) ---");
                console.error(backgroundError.message);
                console.error("--- This did not stop the user's request. ---");
            }
        };

        // Call the function to run in the background.
        runBackgroundTasks();
    });

    // --- THIS IS YOUR ORIGINAL FUNCTION (UNCHANGED) ---
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

        const addField = (value, dbColumn) => {
            if (value !== undefined && value !== null) {
                updateFields.push(`${dbColumn} = $${paramIndex++}`);
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

        if (phone !== undefined && phone !== null) {
            updateFields.push(`phone = $${paramIndex++}`);

            queryParams.push(process_phone_no(phone));
        }

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

        updateFields.push(`updated_at = $${paramIndex++}`);
        queryParams.push(updated_at);

        if (updateFields.length <= 1) {
            throw new apiError(400, "No valid fields provided for update.");
        }

        let whereClause;
        if (id) {
            whereClause = `id = $${paramIndex++}`;
            queryParams.push(id);
        } else {
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

    // --- THIS IS YOUR ORIGINAL FUNCTION (UNCHANGED) ---
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

        await pool.query("DELETE FROM doctor_meetings WHERE doctor_id = $1", [
            doctorId,
        ]);

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

   
    // --- THIS IS YOUR ORIGINAL FUNCTION (UNCHANGED) ---
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
    
    const ndmMap = {}; // {name: id}
    const ndmPlaceholder = Array.from(allNDMNames).map((_, i) => `$${i + 1}`).join(',');
    const ndmResult = await pool.query(`SELECT id, first_name, last_name FROM users WHERE first_name IN (${ndmPlaceholder}) OR CONCAT(first_name,' ',last_name) IN (${ndmPlaceholder})`, Array.from(allNDMNames));
    
    ndmResult.rows.forEach(r => {
        const fullName = (r.first_name + (r.last_name ? ' ' + r.last_name : '')).trim().toLowerCase();
        ndmMap[r.first_name.toLowerCase()] = r.id;
        ndmMap[fullName] = r.id;
    });

    const doctorPlaceholder = Array.from(allDoctorPhones).map((_, i) => `$${i + 1}`).join(',');
    const doctorResult = await pool.query(`SELECT id, phone, onboarding_date, last_meeting, assigned_agent_id_offline FROM doctors WHERE phone IN (${doctorPlaceholder})`, Array.from(allDoctorPhones));
    const doctorMap = {}; // {phone: {id, ...}}
    doctorResult.rows.forEach(r => doctorMap[r.phone] = r);

    const newDoctorInserts = []; 
    const updateDoctorUpdates = []; 
    const meetingsToInsert = [];    
    const createdDoctorIds = {}; // {phone: id or placeholder}
    
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
            
            if (!createdDoctorIds[phone]) {
                const existingDoc = doctorMap[phone];

                if (existingDoc) {
                    let NDM = existingDoc.assigned_agent_id_offline;
                    let newOnboarding = new Date(existingDoc.onboarding_date) < timestamp ? existingDoc.onboarding_date : timestamp;
                    let newLastMeeting = new Date(existingDoc.last_meeting) > timestamp ? existingDoc.last_meeting : timestamp;
                    if (new Date(existingDoc.last_meeting) <= timestamp) NDM = NDM_id;

                    updateDoctorUpdates.push({
                        query: `UPDATE doctors SET onboarding_date = $1, last_meeting = $2, location = $3, gps_location_link = $4, updated_at = $6, assigned_agent_id_offline = $7 WHERE phone = $5`,
                        params: [newOnboarding, newLastMeeting, locationJson, gps_location_link, phone, timestamp, NDM],
                    });
                    createdDoctorIds[phone] = existingDoc.id; // Store real ID
                    updatedDoctorsCount++;

                } else {
                    newDoctorInserts.push(
                        fullName, phone, locationJson, gps_location_link, timestamp, timestamp, NDM_id
                    );
                    createdDoctorIds[phone] = 'NEW_ID_' + phone; // Store placeholder ID
                    processedDoctorsCount++;
                }
            }
            
            meetingsToInsert.push({
                doctorId: createdDoctorIds[phone], 
                NDM_id, duration, locationJson, gps_location_link, meeting_notes, photosJSON, meeting_summary, timestamp
            });
            
        } catch (error) {
            failedRows.push({ rowNumber, reason: error.message });
            console.error(`[Row ${rowNumber}]: FAILED during local processing: ${error.message}`);
        }
    }
    
    const updatePromises = updateDoctorUpdates.map(u => pool.query(u.query, u.params));
    await Promise.all(updatePromises);
    
    let insertedDoctorIds = {}; // {phone: actual_uuid}
    const doctorChunkSize = 5000; 
    const doctorColumns = ['first_name', 'phone', 'location', 'gps_location_link', 'onboarding_date', 'last_meeting', 'assigned_agent_id_offline'];
    const doctorRowLength = doctorColumns.length;

    for (let i = 0; i < newDoctorInserts.length; i += doctorRowLength * doctorChunkSize) {
        const chunk = newDoctorInserts.slice(i, i + doctorRowLength * doctorChunkSize);
        if (chunk.length === 0) continue;

        const valuePlaceholders = [];
        const totalRows = chunk.length / doctorRowLength;
        for (let j = 0; j < totalRows; j++) {
            const placeholders = Array.from({ length: doctorRowLength }, (_, k) => `$${j * doctorRowLength + k + 1}`).join(', ');
            valuePlaceholders.push(`(${placeholders})`);
        }
        
        const newDoctorResult = await pool.query(`INSERT INTO doctors (${doctorColumns.join(', ')}) VALUES ${valuePlaceholders.join(', ')} RETURNING id, phone`, chunk);
        newDoctorResult.rows.forEach(r => { insertedDoctorIds[r.phone] = r.id; });
    }

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

    let meetingCount = 0;
    const meetingChunkSize = 5000;
    const meetingColumns = ['doctor_id', 'agent_id', 'meeting_type', 'duration', 'location', 'gps_location_link', 'meeting_notes', 'photos', 'gps_verified', 'meeting_summary', 'created_at', 'updated_at'];
    const meetingRowLength = meetingColumns.length;

    for (let i = 0; i < finalMeetingsToInsert.length; i += meetingRowLength * meetingChunkSize) {
        const chunk = finalMeetingsToInsert.slice(i, i + meetingRowLength * meetingChunkSize);
        if (chunk.length === 0) continue;

        const valuePlaceholders = [];
        const totalRows = chunk.length / meetingRowLength;
        for (let j = 0; j < totalRows; j++) {
            const placeholders = Array.from({ length: meetingRowLength }, (_, k) => `$${j * meetingRowLength + k + 1}`).join(', ');
            valuePlaceholders.push(`(${placeholders})`);
        }
        
        const result = await pool.query(`INSERT INTO doctor_meetings (${meetingColumns.join(', ')}) VALUES ${valuePlaceholders.join(', ')}`, chunk);
        meetingCount += result.rowCount;
    }

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

    // --- THIS IS YOUR ORIGINAL FUNCTION (UNCHANGED) ---
    createOnlineDoctors = asyncHandler(async (req, res, next) => {
        const file = req.file;
        const ndmPhoneRaw = req.params.ndmPhone;
    
        if (!file) throw new apiError(400, "No file uploaded.");
        if (!ndmPhoneRaw) throw new apiError(400, "NDM phone number is required.");
    
        const ndmPhone = process_phone_no(ndmPhoneRaw);
        if (!ndmPhone) throw new apiError(400, "Invalid NDM phone number format.");
    
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
        
        const doctorMap = {}; // {phone: id}
        if (allDoctorPhones.size > 0) {
            const doctorPhonesArray = Array.from(allDoctorPhones);
            const placeholderList = doctorPhonesArray.map((_, i) => `$${i + 1}`).join(',');
            const doctorResult = await pool.query(`SELECT id, phone FROM doctors WHERE phone IN (${placeholderList})`, doctorPhonesArray);
            doctorResult.rows.forEach(r => doctorMap[r.phone] = r.id);
        }
    
        const newDoctorInserts = []; 
        const updateDoctorUpdates = []; 
        const processedPhonesInBatch = new Set(); 
        
        let newlyCreatedCount = 0;
        let updatedCount = 0;
    
        for (const { rowNumber, doctorName, doctorPhone, location } of rowsToProcess) {
            try {
                if (!processedPhonesInBatch.has(doctorPhone)) {
                    
                    const existingId = doctorMap[doctorPhone];
                    const { firstName, lastName } = processDoctorName(doctorName);
                    const fullName = `${firstName} ${lastName}`.trim();
                    const locationJson = JSON.stringify({ locality: location });
    
                    if (existingId) {
                        updateDoctorUpdates.push({ id: existingId, phone: doctorPhone, ndmId: ndmId });
                        updatedCount++;
                    } else {
                        newDoctorInserts.push(fullName, doctorPhone, locationJson, ndmId);
                        newlyCreatedCount++;
                    }
                    
                    processedPhonesInBatch.add(doctorPhone);
                }
            } catch (error) {
                failedRows.push({ rowNumber, reason: error.message });
            }
        }
        
        const updatePromises = updateDoctorUpdates.map(u => 
            pool.query("UPDATE doctors SET assigned_agent_id_online = $1, updated_at = NOW() WHERE id = $2", [u.ndmId, u.id])
        );
        await Promise.all(updatePromises);
        
        const doctorChunkSize = 10000; 
        const doctorColumns = ['first_name', 'phone', 'location', 'assigned_agent_id_online'];
        const doctorRowLength = doctorColumns.length;
    
        for (let i = 0; i < newDoctorInserts.length; i += doctorRowLength * doctorChunkSize) {
            const chunk = newDoctorInserts.slice(i, i + doctorRowLength * doctorChunkSize);
            if (chunk.length === 0) continue;
    
            const valuePlaceholders = [];
            const totalRows = chunk.length / doctorRowLength;
            for (let j = 0; j < totalRows; j++) {
                const placeholders = Array.from({ length: doctorRowLength }, (_, k) => `$${j * doctorRowLength + k + 1}`).join(', ');
                valuePlaceholders.push(`(${placeholders})`);
            }
            
            const bulkInsertQuery = `INSERT INTO doctors (${doctorColumns.join(', ')}) VALUES ${valuePlaceholders.join(', ')}`;
            await pool.query(bulkInsertQuery, chunk);
        }
    
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

    // --- THIS IS YOUR ORIGINAL FUNCTION (UNCHANGED) ---
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

    // --- THIS IS YOUR ORIGINAL FUNCTION (UNCHANGED) ---
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
        
        for (let i = 0; i < doctorsCallLogs.length; i++) {
            const row = doctorsCallLogs[i];
            const rowNumber = i + 2;

            try {
                const doctorPhoneRaw = row[2]; 
                const agentPhoneRaw = row[11]; 
                const startTimeRaw = row[9];
                
                if (!doctorPhoneRaw || !agentPhoneRaw) {
                    throw new Error("Missing Doctor Phone or SF Number.");
                }
                
                let doctorPhone;
                let agentPhone;

                try {
                    doctorPhone = process_phone_no(doctorPhoneRaw);
                    agentPhone = process_phone_no(agentPhoneRaw);
                } catch (phoneError) {
                    throw new Error("Provide a valid phone number");
                }
                
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

        
        const finalMeetingsToInsert = []; 
        let successfulRowsCount = 0;

        for (const { row, rowNumber, doctorPhone, agentPhone, timestamp } of rowsToProcess) {
            try {
                const doctorId = doctorMap[doctorPhone];
                const agentId = userMap[agentPhone];

                if (!doctorId) {
                    throw new Error(`Skipped: Phone number ${doctorPhone} is not a registered Doctor.`);
                }
                
                if (!agentId) {
                    throw new Error(`Agent not found for SF Number: ${agentPhone}.`);
                }

                const callStatus = row[6];       
                const durationString = row[7];
                
                const durationMinutes = convertDurationToMinutes(durationString);
                
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
                failedRows.push({ rowNumber, reason: error.message });
                console.error(`[Row ${rowNumber}]: FAILED during filtering: ${error.message}`);
            }
        }
        
        
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
                 meetingCount = 0; 
                 const failedInsertCount = finalMeetingsToInsert.length / rowLength;
                 for (let i = 0; i < failedInsertCount; i++) {
                     failedRows.push({ rowNumber: `Successful data block ${i + 1}`, reason: `Critical DB failure on bulk insert: ${dbError.message.substring(0, 100)}...` });
                 }
            }
        }

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