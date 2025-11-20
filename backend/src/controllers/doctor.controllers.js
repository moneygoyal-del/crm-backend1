import apiError from "../utils/apiError.utils.js";
import apiResponse from "../utils/apiResponse.utils.js";
import asyncHandler from "../utils/asynchandler.utils.js";
import { 
    process_phone_no, 
    processTimeStamp, 
    processString, 
    convertDurationToMinutes, 
    parseCallLogTimestamp, 
    getIndianTimeISO 
} from "../helper/preprocess_data.helper.js";
import { processDoctorName } from "../helper/process_doctor_name.helper.js";
import { pool } from "../DB/db.js";
import readCsvFile from "../helper/read_csv.helper.js";
import fs from "fs/promises";
import { addToSheetQueue } from "../utils/sheetQueue.util.js"; 
import { uploadAndGetLink } from "../utils/driveUploader.utils.js"; 
import { sendDoctorMeetingNotification } from "../utils/notification.util.js";
import path from "path";
import { logAudit } from "../utils/auditLogger.util.js";

export default class doctorController {

    // --- 1. CREATE DOCTOR (Manual) ---
    createDoctorByName = asyncHandler(async (req, res, next) => {
        const {
            ndm_name, doctor_name, doctor_phone_number, locality, duration_of_meeting,
            queries_by_the_doctor, comments_by_ndm, chances_of_getting_leads,
            clinic_image_link, selfie_image_link, gps_location_of_the_clinic,
            timestamp_of_the_meeting, latitude, longitude,
        } = req.body;

        if (!ndm_name || !doctor_phone_number) throw new apiError(400, "Compulsory fields missing");

        const timestamp = processTimeStamp(timestamp_of_the_meeting);
        const phone = process_phone_no(doctor_phone_number);

        if (!phone || !timestamp) throw new apiError(400, "Invalid phone or timestamp");

        const { firstName, lastName } = processDoctorName(doctor_name);
        const fullName = (firstName + " " + lastName).trim();

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

        if (getNDM.rows.length == 0) throw new apiError(404, "No ndm found with the name " + ndm_name);
        let NDM = getNDM?.rows[0]?.id;

        // Use IST for system timestamps
        const currentTimeIST = getIndianTimeISO();

        if (existingDoctor?.rows?.length > 0) {
            const doc = existingDoctor.rows[0];
            let newOnboarding = new Date(doc.onboarding_date) < new Date(timestamp) ? doc.onboarding_date : timestamp;
            let newLastMeeting = new Date(doc.last_meeting) > new Date(timestamp) ? doc.last_meeting : timestamp;
            if (new Date(doc.last_meeting) <= new Date(timestamp)) {
                NDM = doc.assigned_agent_id_offline;
            }

            await pool.query(
                `UPDATE doctors SET onboarding_date = $1, last_meeting = $2, location = $3, gps_location_link = $4, updated_at = $6, assigned_agent_id_offline = $7 WHERE phone = $5`,
                [newOnboarding, newLastMeeting, locationJson, gps_location_of_the_clinic, phone, currentTimeIST, NDM]
            );
        } else {
            await pool.query(
                `INSERT INTO doctors (first_name, phone, location, gps_location_link, onboarding_date, last_meeting, assigned_agent_id_offline, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
                [fullName, phone, locationJson, gps_location_of_the_clinic, timestamp, timestamp, NDM, currentTimeIST, currentTimeIST]
            );
        }

        const doctor = await pool.query("SELECT id FROM doctors WHERE phone = $1", [phone]);
        
        const photosJSON = JSON.stringify({
            clinicImage: clinic_image_link,
            selfieImage: selfie_image_link,
        });

        // Meeting created_at is the meeting time (timestamp), updated_at is entry time (currentTimeIST)
        const meeting = await pool.query(
            "INSERT INTO doctor_meetings (doctor_id,agent_id,meeting_type,duration,location,gps_location_link,meeting_notes,photos,gps_verified,meeting_summary,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id,agent_id,doctor_id",
            [
                doctor?.rows[0]?.id, NDM, "physical", duration_of_meeting, locationJson,
                gps_location_of_the_clinic, queries_by_the_doctor, photosJSON, true,
                chances_of_getting_leads, timestamp, currentTimeIST
            ]
        );

        res.status(201).json(new apiResponse(201, meeting.rows[0], "Doctor and meeting successfully created"));
    });

    // --- 2. CREATE MEETING (Web Form) ---
    createMeetingFromWeb = asyncHandler(async (req, res, next) => {
        const loggedInUser = req.user;
        if (!loggedInUser || !loggedInUser.id) throw new apiError(401, "User not authenticated");
        
        const {
            doctor_name, doctor_phone_number, locality, duration_of_meeting,
            queries_by_the_doctor, comments_by_ndm, chances_of_getting_leads,
            timestamp_of_the_meeting, 
            gps_location_of_the_clinic, latitude, longitude, facilities, opd_count,
            numPatientsDuringMeeting, rating
        } = req.body;

        const ndm_name = loggedInUser.first_name;
        if (!ndm_name || !doctor_phone_number) throw new apiError(400, "Compulsory fields missing");
        
        const timestamp = processTimeStamp(timestamp_of_the_meeting); 
        const phone = process_phone_no(doctor_phone_number);
        if (!phone || !timestamp) throw new apiError(400, "Invalid phone or timestamp format");

        const { firstName, lastName } = processDoctorName(doctor_name);
        const fullName = `${firstName} ${lastName}`.trim();

        const locationJson = JSON.stringify({ locality: locality, latitude: latitude, longitude: longitude });
        
        const existingDoctor = await pool.query("SELECT id, onboarding_date, last_meeting, assigned_agent_id_offline FROM doctors WHERE phone = $1", [phone]);
        let NDM = loggedInUser.id; 

        // Use IST for updates
        const currentTimeIST = getIndianTimeISO();

        if (existingDoctor?.rows?.length > 0) {
            const doc = existingDoctor.rows[0];
            let newOnboarding = doc.onboarding_date < timestamp ? doc.onboarding_date : timestamp;
            let newLastMeeting = doc.last_meeting > timestamp ? doc.last_meeting : timestamp;
            if (doc.last_meeting > timestamp) {
                NDM = doc.assigned_agent_id_offline;
            }
            await pool.query(
                `UPDATE doctors SET 
                    onboarding_date = $1, last_meeting = $2, location = $3, 
                    updated_at = $5, assigned_agent_id_offline = $6, gps_location_link = $7 
                 WHERE phone = $4`,
                [ newOnboarding, newLastMeeting, locationJson, phone, currentTimeIST, NDM, gps_location_of_the_clinic ]
            );
        } else {
            await pool.query(
                `INSERT INTO doctors (
                    first_name, phone, location, onboarding_date, 
                    last_meeting, assigned_agent_id_offline, gps_location_link, created_at, updated_at
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
                [ fullName, phone, locationJson, timestamp, timestamp, NDM, gps_location_of_the_clinic, currentTimeIST, currentTimeIST ]
            );
        }

        const doctor = await pool.query("SELECT id FROM doctors WHERE phone = $1", [phone]);
        if (doctor.rows.length === 0) throw new apiError(500, "Error creating doctor.");
        
        // Insert meeting: created_at = meeting time, updated_at = entry time (IST)
        const meeting = await pool.query(
            `INSERT INTO doctor_meetings (
                doctor_id, agent_id, meeting_type, duration, location, 
                meeting_notes, gps_verified, meeting_summary, created_at, updated_at,
                photos, gps_location_link 
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) 
            RETURNING id, agent_id, doctor_id`, 
            [
                doctor.rows[0].id, NDM, "physical", duration_of_meeting,
                locationJson, 
                `Queries: ${queries_by_the_doctor} \n\nComments: ${comments_by_ndm}`, 
                true, chances_of_getting_leads, 
                timestamp, currentTimeIST,
                null, gps_location_of_the_clinic
            ]
        );

        const newMeetingId = meeting.rows[0].id;

        await logAudit(loggedInUser.id, 'MEETING_LOGGED', 'doctor_meeting', newMeetingId, { doctorName: fullName });
        
        res.status(201).json(new apiResponse(201, { ...meeting.rows[0], doctor_name: fullName }, "Doctor and meeting successfully created"));

        const runBackgroundTasks = async () => {
            let clinicDriveUrl = null;
            let selfieDriveUrl = null;

            try {
                const clinicFile = req.files?.clinic_photo?.[0];
                const selfieFile = req.files?.selfie_photo?.[0];

                if (clinicFile) {
                    try {
                        const fileExt = path.extname(clinicFile.originalname) || '.jpg';
                        const fileName = `${NDM}_${Date.now()}_clinic${fileExt}`;
                        const links = await uploadAndGetLink(clinicFile.path, clinicFile.mimetype, fileName);
                        clinicDriveUrl = links.directLink;
                    } catch (uploadErr) {
                        console.error(`Clinic photo upload failed for meeting ${newMeetingId}:`, uploadErr.message);
                    } finally {
                        await fs.unlink(clinicFile.path);
                    }
                }

                if (selfieFile) {
                    try {
                        const fileExt = path.extname(selfieFile.originalname) || '.jpg';
                        const fileName = `${NDM}_${Date.now()}_selfie${fileExt}`;
                        const links = await uploadAndGetLink(selfieFile.path, selfieFile.mimetype, fileName);
                        selfieDriveUrl = links.directLink;
                    } catch (uploadErr) {
                        console.error(`Selfie photo upload failed for meeting ${newMeetingId}:`, uploadErr.message);
                    } finally {
                        await fs.unlink(selfieFile.path);
                    }
                }

                if (clinicDriveUrl || selfieDriveUrl) {
                    const photosJSON = JSON.stringify({
                        clinicImage: clinicDriveUrl,
                        selfieImage: selfieDriveUrl,
                    });
                    await pool.query(
                        `UPDATE doctor_meetings SET photos = $1 WHERE id = $2`,
                        [photosJSON, newMeetingId]
                    );
                }

                const [date_of_meeting, time_of_meeting] = timestamp_of_the_meeting.split(' ');
                
                const sheetRow = [
                    ndm_name, doctor_name, doctor_phone_number, locality,
                    facilities, opd_count, duration_of_meeting, 
                    numPatientsDuringMeeting, queries_by_the_doctor, rating,
                    comments_by_ndm, chances_of_getting_leads,
                    clinicDriveUrl || "N/A",
                    selfieDriveUrl || "N/A",
                    gps_location_of_the_clinic, date_of_meeting,
                    time_of_meeting, timestamp
                ];
                await addToSheetQueue("DOCTOR_MEETING", sheetRow);

                await sendDoctorMeetingNotification(doctor_name, ndm_name, doctor_phone_number);

            } catch (backgroundError) {
                console.error("--- BACKGROUND TASK FAILED (Doctor Meeting) ---", backgroundError.message);
            }
        };
        
        runBackgroundTasks();
    });

    // --- 3. UPDATE DOCTOR ---
    updateDoctor = asyncHandler(async (req, res, next) => {
        let { id, phone, first_name, last_name, location_locality, gps_location_link, status, assigned_agent_id_offline, assigned_agent_id_online } = req.body;

        if (!id && !phone) throw new apiError(400, "Provide id or phone.");

        // Use IST
        const updated_at = getIndianTimeISO();
        
        const updateFields = [];
        const queryParams = [];
        let paramIndex = 1;

        const addField = (value, dbColumn) => {
            if (value !== undefined && value !== null) {
                updateFields.push(`${dbColumn} = $${paramIndex++}`);
                queryParams.push(
                    ["first_name", "last_name", "status"].includes(dbColumn) ? processString(value) : value
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

        if (location_locality !== undefined || req.body.latitude !== undefined) {
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

        if (updateFields.length <= 1) throw new apiError(400, "No valid fields provided.");

        let whereClause;
        if (id) {
            whereClause = `id = $${paramIndex++}`;
            queryParams.push(id);
        } else {
            whereClause = `phone = $${paramIndex++}`;
            queryParams.push(process_phone_no(phone));
        }

        const updateQuery = `UPDATE doctors SET ${updateFields.join(", ")} WHERE ${whereClause} RETURNING id, phone, first_name, last_name, updated_at`;
        const updatedResult = await pool.query(updateQuery, queryParams);

        if (updatedResult.rowCount === 0) throw new apiError(404, "Doctor not found.");
        const updatedDoc = updatedResult.rows[0];

        if (req.user) {
            await logAudit(req.user.id, 'DOCTOR_UPDATE', 'doctor', updatedDoc.id, { doctorName: updatedDoc.first_name });
        }

        res.status(200).json(new apiResponse(200, updatedResult.rows[0], "Doctor updated"));
    });

    // --- 4. DELETE DOCTOR ---
    deleteDoctor = asyncHandler(async (req, res, next) => {
        const { id, phone } = req.body;
        if (!id && !phone) throw new apiError(400, "Provide id or phone number.");

        let doctorId;
        if (id) {
            doctorId = id;
        } else {
            const processedPhone = process_phone_no(phone);
            const doctorResult = await pool.query("SELECT id FROM doctors WHERE phone = $1", [processedPhone]);
            if (doctorResult.rows.length === 0) throw new apiError(404, "Doctor not found.");
            doctorId = doctorResult.rows[0].id;
        }

        await pool.query("DELETE FROM doctor_meetings WHERE doctor_id = $1", [doctorId]);
        const deleteResult = await pool.query("DELETE FROM doctors WHERE id = $1 RETURNING id, phone, first_name", [doctorId]);

        if (deleteResult.rowCount === 0) throw new apiError(404, "Doctor not found or failed to delete.");
        
        res.status(200).json(new apiResponse(200, deleteResult.rows[0], "Doctor and related meetings successfully deleted"));
    });

    // --- 5. BATCH UPLOAD: DOCTORS & MEETINGS ---
    createDoctorBatchAndMeetings = asyncHandler(async (req, res, next) => {
        const file = req.file;
        if (!file) throw new apiError(400, "No file uploaded.");

        const doctorsCsvData = await readCsvFile(file.path);
        fs.unlink(file.path, (err) => {});

        const allNDMNames = new Set();
        const allDoctorPhones = new Set();
        const rowsToProcess = [];
        const failedRows = [];

        for (let i = 0; i < doctorsCsvData.length; i++) {
            const row = doctorsCsvData[i];
            const rowNumber = i + 2;
            try {
                if (!row || row.length < 17) throw new Error("Row empty/too few columns");
                const FullName = row[1];
                const phoneRaw = row[2];
                const ndm_name = row[0];
                const timestamp = processTimeStamp(row[17] + " " + row[16]); 
                const phone = process_phone_no(phoneRaw);

                if (!FullName || !phone || !timestamp || !ndm_name) throw new Error("Missing fields");
                allDoctorPhones.add(phone);
                allNDMNames.add(ndm_name.trim().toLowerCase());
                rowsToProcess.push({ row, rowNumber, timestamp, phone });
            } catch (error) {
                failedRows.push({ rowNumber, reason: error.message });
            }
        }
        
        if (rowsToProcess.length === 0) return res.status(201).json(new apiResponse(201, { newly_created_count: 0, failures: failedRows }, "No valid data."));
        
        const ndmMap = {};
        const ndmPlaceholder = Array.from(allNDMNames).map((_, i) => `$${i + 1}`).join(',');
        const ndmResult = await pool.query(`SELECT id, first_name, last_name FROM users WHERE first_name IN (${ndmPlaceholder}) OR CONCAT(first_name,' ',last_name) IN (${ndmPlaceholder})`, Array.from(allNDMNames));
        ndmResult.rows.forEach(r => {
            const fullName = (r.first_name + (r.last_name ? ' ' + r.last_name : '')).trim().toLowerCase();
            ndmMap[r.first_name.toLowerCase()] = r.id;
            ndmMap[fullName] = r.id;
        });

        const doctorPlaceholder = Array.from(allDoctorPhones).map((_, i) => `$${i + 1}`).join(',');
        const doctorResult = await pool.query(`SELECT id, phone, onboarding_date, last_meeting, assigned_agent_id_offline FROM doctors WHERE phone IN (${doctorPlaceholder})`, Array.from(allDoctorPhones));
        const doctorMap = {};
        doctorResult.rows.forEach(r => doctorMap[r.phone] = r);

        const newDoctorInserts = []; 
        const updateDoctorUpdates = []; 
        const meetingsToInsert = [];    
        const createdDoctorIds = {}; 
        
        let processedDoctorsCount = 0;
        let updatedDoctorsCount = 0;

        // Use IST for system timestamps
        const currentTimeIST = getIndianTimeISO();

        for (const { row, rowNumber, timestamp, phone } of rowsToProcess) {
            try {
                const ndm_name = row[0].trim().toLowerCase();
                const NDM_id = ndmMap[ndm_name];
                if (!NDM_id) throw new Error(`NDM '${row[0]}' not found.`);

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
                        let newOnboarding = existingDoc.onboarding_date < timestamp ? existingDoc.onboarding_date : timestamp;
                        let newLastMeeting = existingDoc.last_meeting > timestamp ? existingDoc.last_meeting : timestamp;
                        if (existingDoc.last_meeting <= timestamp) NDM = NDM_id;

                        updateDoctorUpdates.push({
                            query: `UPDATE doctors SET onboarding_date = $1, last_meeting = $2, location = $3, gps_location_link = $4, updated_at = $6, assigned_agent_id_offline = $7 WHERE phone = $5`,
                            params: [newOnboarding, newLastMeeting, locationJson, gps_location_link, phone, currentTimeIST, NDM],
                        });
                        createdDoctorIds[phone] = existingDoc.id; 
                        updatedDoctorsCount++;
                    } else {
                        // Insert using meeting timestamp for last_meeting, but IST for created/updated
                        newDoctorInserts.push(fullName, phone, locationJson, gps_location_link, timestamp, timestamp, NDM_id);
                        createdDoctorIds[phone] = 'NEW_ID_' + phone; 
                        processedDoctorsCount++;
                    }
                }
                meetingsToInsert.push({
                    doctorId: createdDoctorIds[phone], NDM_id, duration, locationJson, gps_location_link, meeting_notes, photosJSON, meeting_summary, timestamp
                });
            } catch (error) {
                failedRows.push({ rowNumber, reason: error.message });
            }
        }
        
        await Promise.all(updateDoctorUpdates.map(u => pool.query(u.query, u.params)));
        
        let insertedDoctorIds = {}; 
        const doctorChunkSize = 5000; 
        const doctorColumns = ['first_name', 'phone', 'location', 'gps_location_link', 'onboarding_date', 'last_meeting', 'assigned_agent_id_offline'];
        
        for (let i = 0; i < newDoctorInserts.length; i += doctorColumns.length * doctorChunkSize) {
            const chunk = newDoctorInserts.slice(i, i + doctorColumns.length * doctorChunkSize);
            if (chunk.length === 0) continue;
            const valuePlaceholders = [];
            const totalRows = chunk.length / doctorColumns.length;
            for (let j = 0; j < totalRows; j++) {
                const placeholders = Array.from({ length: doctorColumns.length }, (_, k) => `$${j * doctorColumns.length + k + 1}`).join(', ');
                valuePlaceholders.push(`(${placeholders})`);
            }
            const newDoctorResult = await pool.query(`INSERT INTO doctors (${doctorColumns.join(', ')}) VALUES ${valuePlaceholders.join(', ')} RETURNING id, phone`, chunk);
            newDoctorResult.rows.forEach(r => { insertedDoctorIds[r.phone] = r.id; });
        }

        const finalMeetingsToInsert = [];
        meetingsToInsert.forEach(m => {
            const phone = m.doctorId.replace('NEW_ID_', '');
            const doctorId = m.doctorId.startsWith('NEW_ID_') ? insertedDoctorIds[phone] : m.doctorId;
            if (doctorId) {
                finalMeetingsToInsert.push(
                    doctorId, m.NDM_id, "physical", m.duration, m.locationJson, m.gps_location_link,
                    m.meeting_notes, m.photosJSON, true, m.meeting_summary, m.timestamp, currentTimeIST
                );
            }
        });

        let meetingCount = 0;
        const meetingChunkSize = 5000;
        const meetingColumns = ['doctor_id', 'agent_id', 'meeting_type', 'duration', 'location', 'gps_location_link', 'meeting_notes', 'photos', 'gps_verified', 'meeting_summary', 'created_at', 'updated_at'];

        for (let i = 0; i < finalMeetingsToInsert.length; i += meetingColumns.length * meetingChunkSize) {
            const chunk = finalMeetingsToInsert.slice(i, i + meetingColumns.length * meetingChunkSize);
            if (chunk.length === 0) continue;
            const valuePlaceholders = [];
            const totalRows = chunk.length / meetingColumns.length;
            for (let j = 0; j < totalRows; j++) {
                const placeholders = Array.from({ length: meetingColumns.length }, (_, k) => `$${j * meetingColumns.length + k + 1}`).join(', ');
                valuePlaceholders.push(`(${placeholders})`);
            }
            const result = await pool.query(`INSERT INTO doctor_meetings (${meetingColumns.join(', ')}) VALUES ${valuePlaceholders.join(', ')}`, chunk);
            meetingCount += result.rowCount;
        }

        res.status(201).json(new apiResponse(201, { newly_created_count: processedDoctorsCount, updated_count: updatedDoctorsCount, failed_count: failedRows.length, failures: failedRows }, "Batch processing complete."));
    });

    // --- 6. BATCH UPLOAD: ONLINE DOCTORS ---
    createOnlineDoctors = asyncHandler(async (req, res, next) => {
        const file = req.file;
        const ndmPhoneRaw = req.params.ndmPhone;
    
        if (!file) throw new apiError(400, "No file uploaded.");
        if (!ndmPhoneRaw) throw new apiError(400, "NDM phone number is required.");
    
        const ndmPhone = process_phone_no(ndmPhoneRaw);
        const ndmResult = await pool.query("SELECT id FROM users WHERE phone = $1", [ndmPhone]);
        if (ndmResult.rows.length === 0) throw new apiError(404, `NDM with phone ${ndmPhone} not found.`);
        const ndmId = ndmResult.rows[0].id;
        
        const doctorsCsvData = await readCsvFile(file.path);
        fs.unlink(file.path, (err) => {});
        
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
                allDoctorPhones.add(doctorPhone);
                rowsToProcess.push({ row, rowNumber, doctorName, doctorPhone, location: row[2] });
            } catch (error) {
                failedRows.push({ rowNumber, reason: error.message });
            }
        }
        
        const doctorMap = {}; 
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
        
        // Use IST
        const currentIST = getIndianTimeISO();

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
            pool.query("UPDATE doctors SET assigned_agent_id_online = $1, updated_at = $3 WHERE id = $2", [u.ndmId, u.id, currentIST])
        );
        await Promise.all(updatePromises);
        
        const doctorChunkSize = 10000; 
        const doctorColumns = ['first_name', 'phone', 'location', 'assigned_agent_id_online'];
        
        for (let i = 0; i < newDoctorInserts.length; i += doctorColumns.length * doctorChunkSize) {
            const chunk = newDoctorInserts.slice(i, i + doctorColumns.length * doctorChunkSize);
            if (chunk.length === 0) continue;
            const valuePlaceholders = [];
            const totalRows = chunk.length / doctorColumns.length;
            for (let j = 0; j < totalRows; j++) {
                const placeholders = Array.from({ length: doctorColumns.length }, (_, k) => `$${j * doctorColumns.length + k + 1}`).join(', ');
                valuePlaceholders.push(`(${placeholders})`);
            }
            await pool.query(`INSERT INTO doctors (${doctorColumns.join(', ')}) VALUES ${valuePlaceholders.join(', ')}`, chunk);
        }
    
        res.status(201).json(new apiResponse(201, { newly_created_count: newlyCreatedCount, updated_count: updatedCount, failed_count: failedRows.length, failures: failedRows }, "Batch Processing Complete"));
    });

    // --- 7. DELETE DOCTOR MEETING ---
    deleteDoctorMeeting = asyncHandler(async (req, res, next) => {
        const { id } = req.body;
        if (!id) throw new apiError(400, "Provide id of the meeting.");

        const deleteDoctorMeeting = await pool.query("DELETE FROM DOCTOR_MEETINGS WHERE ID = $1", [id]);
        if (deleteDoctorMeeting?.rowCount == 0) throw new apiError(500, "Failed to delete.");

        res.status(200).json(new apiResponse(200, {}, "Meeting deleted"));
    });

    // --- 8. CREATE CALL LOGS BATCH ---
    createDoctorCallLogBatch = asyncHandler(async (req, res, next) => {
        const file = req.file;
        if (!file) throw new apiError(400, "No file uploaded.");
        const doctorsCallLogs = await readCsvFile(file.path);
        fs.unlink(file.path, (err) => {});

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
                if (!doctorPhoneRaw || !agentPhoneRaw) throw new Error("Missing Doctor Phone or SF Number.");
                const doctorPhone = process_phone_no(doctorPhoneRaw);
                const agentPhone = process_phone_no(agentPhoneRaw);
                const timestamp = parseCallLogTimestamp(startTimeRaw); // Returns local ISO string from helper
                if (!timestamp) throw new Error("Invalid time value");
                allDoctorPhones.add(doctorPhone);
                allAgentPhones.add(agentPhone);
                rowsToProcess.push({ row, rowNumber, doctorPhone, agentPhone, timestamp });
            } catch (error) {
                failedRows.push({ rowNumber, reason: error.message });
            }
        }

        if (rowsToProcess.length === 0) return res.status(201).json(new apiResponse(201, { newly_created_count: 0, failed_count: failedRows.length }, "No valid data"));

        const doctorMap = {};
        if (allDoctorPhones.size > 0) {
            const doctorPhonesArray = Array.from(allDoctorPhones);
            const placeholderList = doctorPhonesArray.map((_, i) => `$${i + 1}`).join(',');
            const doctorResult = await pool.query(`SELECT id, phone FROM doctors WHERE phone IN (${placeholderList})`, doctorPhonesArray);
            doctorResult.rows.forEach(r => doctorMap[r.phone] = r.id);
        }

        const userMap = {};
        if (allAgentPhones.size > 0) {
            const userPhonesArray = Array.from(allAgentPhones);
            const placeholderList = userPhonesArray.map((_, i) => `$${i + 1}`).join(',');
            const userResult = await pool.query(`SELECT id, phone FROM users WHERE phone IN (${placeholderList})`, userPhonesArray);
            userResult.rows.forEach(r => userMap[r.phone] = r.id);
        }
        
        const finalMeetingsToInsert = []; 
        
        for (const { row, rowNumber, doctorPhone, agentPhone, timestamp } of rowsToProcess) {
            try {
                const doctorId = doctorMap[doctorPhone];
                const agentId = userMap[agentPhone];
                if (!doctorId) throw new Error(`Skipped: Phone number ${doctorPhone} is not a registered Doctor.`);
                if (!agentId) throw new Error(`Agent not found for SF Number: ${agentPhone}.`);
                const callStatus = row[6];       
                const durationString = row[7];
                const durationMinutes = convertDurationToMinutes(durationString);
                
                finalMeetingsToInsert.push(doctorId, agentId, "call", durationMinutes, null, null, null, null, false, callStatus, timestamp, timestamp);
            } catch (error) {
                failedRows.push({ rowNumber, reason: error.message });
            }
        }
        
        let meetingCount = 0;
        if (finalMeetingsToInsert.length > 0) {
            const columns = ['doctor_id', 'agent_id', 'meeting_type', 'duration', 'location', 'gps_location_link', 'meeting_notes', 'photos', 'gps_verified', 'meeting_summary', 'created_at', 'updated_at'];
            const rowLength = columns.length; 
            const valuePlaceholders = finalMeetingsToInsert.map((_, i) => i + 1).reduce((acc, v, i) => {
                if (i % rowLength === 0) {
                    const placeholders = Array.from({ length: rowLength }, (_, j) => `$${v + j}`).join(', ');
                    acc.push(`(${placeholders})`);
                }
                return acc;
            }, []).join(', ');

            try {
                const result = await pool.query(`INSERT INTO doctor_meetings (${columns.join(', ')}) VALUES ${valuePlaceholders}`, finalMeetingsToInsert);
                meetingCount = result.rowCount;
            } catch (dbError) {
                 meetingCount = 0; 
            }
        }

        res.status(201).json(new apiResponse(201, { newly_created_count: meetingCount, failed_count: failedRows.length, failures: failedRows }, "Call Logs batch processed."));
    });

    // --- 9. UPLOAD PHOTO ---
    uploadMeetingPhoto = asyncHandler(async (req, res) => {
        const file = req.file;
        const user = req.user; 
        if (!file) throw new apiError(400, "No file uploaded.");
        if (!user || !user.id) throw new apiError(401, "User not authenticated.");
        try {
            const fileExt = path.extname(file.originalname) || '.jpg';
            const uniqueName = `${user.id}_${Date.now()}${fileExt}`;
            const links = await uploadAndGetLink(file.path, file.mimetype, uniqueName);
            await fs.unlink(file.path);
            res.status(200).json(new apiResponse(200, { url: links.directLink }, "Document uploaded"));
        } catch (uploadError) {
            try { await fs.unlink(file.path); } catch (e) {}
            throw new apiError(500, "Upload failed.");
        }
    });

    // --- 10. GET DOCTOR BY PHONE ---
    getDoctorByPhone = asyncHandler(async (req, res, next) => {
        const { phone } = req.params;
        if (!phone) throw new apiError(400, "Phone number is required");
        const phone_processed = process_phone_no(phone);
        const result = await pool.query("SELECT first_name, last_name, location FROM doctors WHERE phone = $1", [phone_processed]);
        if (result.rows.length === 0) throw new apiError(404, "Doctor not found");
        const doctor = result.rows[0];
        const fullName = `${doctor.first_name} ${doctor.last_name || ''}`.trim();
        let locality = "";
        if (doctor.location && typeof doctor.location === 'object' && doctor.location.locality) {
            locality = doctor.location.locality;
        }
        res.status(200).json(new apiResponse(200, { name: fullName, locality: locality }, "Doctor fetched"));
    });

}