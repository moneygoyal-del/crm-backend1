import apiError from "../utils/apiError.utils.js";
import apiResponse from "../utils/apiResponse.utils.js";
import asyncHandler from "../utils/asynchandler.utils.js";
import {
    process_phone_no,
    processTimeStamp,
    processString,
} from "../helper/preprocess_data.helper.js";
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

    // BATCH: Create Doctor Batch and Meetings (Existing)
    // BATCH: Create Doctor Batch and Meetings (Existing)
    createDoctorBatchAndMeetings = asyncHandler(async (req, res, next) => {
        const file = req.file;
        if (!file) throw new apiError(400, "No file uploaded.");

        const doctorsCsvData = await readCsvFile(file.path);

        fs.unlink(file.path, (err) => {
            if (err) {
                console.error("Error deleting file:", err);
            } else {
                console.log("File deleted successfully:", file.path);
            }
        });

        const processedDoctors = [];
        const updatedDoctors = [];
        const failedRows = [];

        // Log the start of processing
        console.log(
            `Starting batch processing for ${doctorsCsvData.length} data rows...`
        );

        for (let i = 0; i < doctorsCsvData.length; i++) {
            const row = doctorsCsvData[i];
            const rowNumber = i + 2;

            try {
                if (!row || row.length < 17) {
                    failedRows.push({
                        rowNumber,
                        reason: "Row is empty or has too few columns",
                    });
                    console.log(
                        `[Row ${rowNumber}]: SKIPPED - Malformed or empty row.`
                    );
                    continue;
                }

                const FullName = row[1];
                const phoneRaw = row[2];
                const timeOfMeeting = row[16];
                const date = row[17];

                const timestamp = processTimeStamp(date + " " + timeOfMeeting);

                if (!FullName || !phoneRaw || !timestamp) {
                    failedRows.push({
                        rowNumber,
                        reason: "Missing Name, Phone, or timestamp",
                    });
                    console.log(
                        `[Row ${rowNumber}]: SKIPPED - Essential data missing.`
                    );
                    continue;
                }

                const phone = process_phone_no(phoneRaw);

                if (!phone || !timestamp) {
                    failedRows.push({
                        rowNumber,
                        reason: `Invalid data after processing (Phone: ${phoneRaw}, Timestamp: ${timestamp})`,
                    });
                    console.log(
                        `[Row ${rowNumber}]: SKIPPED - Invalid phone or timestamp.`
                    );
                    continue;
                }

                const { firstName, lastName } = processDoctorName(FullName);
                const dr_name = firstName + " " + lastName;
                const fullName = dr_name.trim();

                const locationJson = JSON.stringify({
                    locality: row[3],
                    latitude: row[18],
                    longitude: row[19],
                });

                const existingDoctor = await pool.query(
                    "SELECT id, onboarding_date, last_meeting, assigned_agent_id_offline FROM doctors WHERE phone = $1",
                    [phone]
                );
                const ndm_name = row[0].trim().toLowerCase();
                const getNDM = await pool.query(
                    "SELECT id FROM users WHERE first_name = $1 OR CONCAT(first_name,' ',last_name) = $1",
                    [ndm_name]
                );

                if (getNDM.rows.length == 0) {
                    console.log(
                        `[Row ${rowNumber}]: SKIPPED - NDM '${ndm_name}' not found.`
                    );
                    continue;
                }

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
                            row[14],
                            phone,
                            timestamp,
                            NDM,
                        ]
                    );
                    updatedDoctors.push({ phone });
                    // --- SUCCESS LOG FOR UPDATE ---
                    console.log(
                        `[Row ${rowNumber}]: SUCCESS - Doctor Updated (Phone: ${phone}).`
                    );
                } else {
                    // INSERT NEW DOCTOR RECORD
                    await pool.query(
                        `INSERT INTO doctors (first_name, phone, location, gps_location_link, onboarding_date, last_meeting, assigned_agent_id_offline) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                        [
                            fullName,
                            phone,
                            locationJson,
                            row[14],
                            timestamp,
                            timestamp,
                            NDM,
                        ]
                    );
                    processedDoctors.push({ phone });
                    // --- SUCCESS LOG FOR INSERT ---
                    console.log(
                        `[Row ${rowNumber}]: SUCCESS - Doctor Inserted (Phone: ${phone}).`
                    );
                }

                const doctor = await pool.query(
                    "SELECT id FROM doctors WHERE phone = $1",
                    [phone]
                );
                if (doctor?.rows[0]?.length == 0) continue;
                const photosJSON = JSON.stringify({
                    clinicImage: row[12],
                    selfieImage: row[13],
                });

                // INSERT NEW MEETING RECORD
                await pool.query(
                    "INSERT INTO doctor_meetings (doctor_id,agent_id,meeting_type,duration,location,gps_location_link,meeting_notes,photos,gps_verified,meeting_summary,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)",
                    [
                        doctor?.rows[0]?.id,
                        NDM,
                        "physical",
                        row[6],
                        locationJson,
                        row[14],
                        row[8],
                        photosJSON,
                        true,
                        row[11],
                        timestamp,
                        timestamp,
                    ]
                );
                // --- SUCCESS LOG FOR MEETING ---
                console.log(
                    `[Row ${rowNumber}]: SUCCESS - Meeting Record Created.`
                );
            } catch (error) {
                // --- FAILURE LOG ---
                console.error(
                    `[Row ${rowNumber}]: FAILED with error: ${error.message}`
                );
                failedRows.push({ rowNumber, reason: error.message });
            }
        }

        console.log("\n--- Batch Processing Complete ---");

        res.status(201).json(
            new apiResponse(
                201,
                {
                    newly_created_count: processedDoctors.length,
                    updated_count: updatedDoctors.length,
                    failed_count: failedRows.length,
                    failures: failedRows,
                },
                "Batch processing complete."
            )
        );
    });

    createOnlineDoctors = asyncHandler(async (req, res, next) => {
        const file = req.file;
        const ndmPhoneRaw = req.params.ndmPhone;

        if (!file) throw new apiError(400, "No file uploaded.");
        if (!ndmPhoneRaw)
            throw new apiError(400, "NDM phone number is required.");

        console.log("File received:", file.path);
        console.log("NDM Phone:", ndmPhoneRaw);

        const ndmPhone = process_phone_no(ndmPhoneRaw);
        if (!ndmPhone) {
            throw new apiError(400, "Invalid NDM phone number format.");
        }

        // Find the NDM's ID from the users table once
        console.log(`Searching for NDM with phone ${ndmPhone}.`);
        const ndmResult = await pool.query(
            "SELECT id FROM users WHERE phone = $1",
            [ndmPhone]
        );
        if (ndmResult.rows.length === 0) {
            throw new apiError(404, `NDM with phone ${ndmPhone} not found.`);
        }
        const ndmId = ndmResult.rows[0].id;
        console.log(`NDM found with ID: ${ndmId}.`);

        const doctorsCsvData = await readCsvFile(file.path);
        console.log(
            `CSV data read successfully. ${doctorsCsvData.length} rows found.`
        );

        fs.unlink(file.path, (err) => {
            if (err) {
                console.error("Error deleting file:", err);
            } else {
                console.log("File deleted successfully:", file.path);
            }
        });

        const processedDoctors = [];
        const updatedDoctors = [];
        const failedRows = [];

        console.log("Starting to process CSV rows...");

        for (let i = 0; i < doctorsCsvData.length; i++) {
            const row = doctorsCsvData[i];
            const rowNumber = i + 2; // Assuming CSV has a header row
            console.log(`[Row ${rowNumber}]: Processing...`);

            try {
                const doctorName = row[0];
                const doctorPhoneRaw = row[1];
                const location = row[2];

                console.log(
                    `[Row ${rowNumber}]: Data - Doctor: ${doctorName}, Phone: ${doctorPhoneRaw}`
                );

                if (!doctorName || !doctorPhoneRaw) {
                    failedRows.push({
                        rowNumber,
                        reason: "Missing Doctor Name or Doctor Phone.",
                    });
                    console.log(
                        `[Row ${rowNumber}]: SKIPPED - Missing required data.`
                    );
                    continue;
                }

                const doctorPhone = process_phone_no(doctorPhoneRaw);

                if (!doctorPhone) {
                    failedRows.push({
                        rowNumber,
                        reason: "Invalid phone number format.",
                    });
                    console.log(
                        `[Row ${rowNumber}]: SKIPPED - Invalid phone number.`
                    );
                    continue;
                }

                // Check if the doctor already exists
                console.log(
                    `[Row ${rowNumber}]: Checking if doctor with phone ${doctorPhone} exists.`
                );
                const existingDoctor = await pool.query(
                    "SELECT id FROM doctors WHERE phone = $1",
                    [doctorPhone]
                );

                if (existingDoctor.rows.length > 0) {
                    // Update the existing doctor's assigned_agent_id_online
                    console.log(
                        `[Row ${rowNumber}]: Doctor exists. Updating...`
                    );
                    await pool.query(
                        "UPDATE doctors SET assigned_agent_id_online = $1, updated_at = NOW() WHERE phone = $2",
                        [ndmId, doctorPhone]
                    );
                    updatedDoctors.push({ phone: doctorPhone });
                    console.log(
                        `[Row ${rowNumber}]: SUCCESS - Doctor updated.`
                    );
                } else {
                    // Insert a new doctor record
                    console.log(
                        `[Row ${rowNumber}]: Doctor does not exist. Creating...`
                    );
                    const { firstName, lastName } =
                        processDoctorName(doctorName);
                    const fullName = `${firstName} ${lastName}`.trim();
                    const locationJson = JSON.stringify({ locality: location });

                    await pool.query(
                        `INSERT INTO doctors (first_name, phone, location, assigned_agent_id_online) VALUES ($1, $2, $3, $4)`,
                        [fullName, doctorPhone, locationJson, ndmId]
                    );
                    processedDoctors.push({ phone: doctorPhone });
                    console.log(
                        `[Row ${rowNumber}]: SUCCESS - Doctor created.`
                    );
                }
            } catch (error) {
                failedRows.push({ rowNumber, reason: error.message });
                console.error(
                    `[Row ${rowNumber}]: FAILED with error: ${error.message}`
                );
            }
        }

        console.log("\n--- Batch Processing Complete ---");

        res.status(201).json(
            new apiResponse(
                201,
                {
                    newly_created_count: processedDoctors.length,
                    updated_count: updatedDoctors.length,
                    failed_count: failedRows.length,
                    failures: failedRows,
                },
                "--- Batch Processing Complete ---"
            )
        );
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
}
