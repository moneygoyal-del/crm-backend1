import apiError from "../utils/apiError.utils.js";
import apiResponse from "../utils/apiResponse.utils.js";
import asyncHandler from "../utils/asynchandler.utils.js";
import { process_phone_no, parseTimestamp } from "../helper/preprocess_data.helper.js";
import { pool } from "../DB/db.js";
import readCsvFile from "../helper/read_csv.helper.js";
import fs from "fs";
import { processDoctorName } from "../helper/process_doctor_name.helper.js";

export default class doctorController {
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

        const processedDoctors = [];
        const updatedDoctors = [];
        const failedRows = [];


        for (let i = 0; i < doctorsCsvData.length; i++) {
            const row = doctorsCsvData[i];
            const rowNumber = i + 2;

            try {
                if (!row || row.length < 17) { // Check if row has enough columns
                    failedRows.push({ rowNumber, reason: "Row is empty or has too few columns" });
                    console.log(`[Row ${rowNumber}]: SKIPPED - Malformed or empty row.`);
                    continue;
                }

                const FullName = row[1];
                const phoneRaw = row[2];
                const timeOfMeeting = row[16];
                const date = row[17];
                const dateParts = date.split('/');
                const day = dateParts[0];
                const month = dateParts[1];
                const year = dateParts[2];

                const formattedString = `${year}-${month}-${day}T${timeOfMeeting}+05:30`;

                const timestamp = new Date(formattedString).toISOString();

                if (!FullName || !phoneRaw || !timestamp) {
                    failedRows.push({ rowNumber, reason: "Missing Name, Phone, or timestamp" });
                    console.log(`[Row ${rowNumber}]: SKIPPED - Essential data missing.`);
                    continue;
                }

                // const timestamp = parseTimestamp(fullTimestampString);
                const phone = process_phone_no(phoneRaw);

                if (!phone || !timestamp) {
                    failedRows.push({ rowNumber, reason: `Invalid data after processing (Phone: ${phoneRaw}, Timestamp: ${fullTimestampString})` });
                    console.log(`[Row ${rowNumber}]: SKIPPED - Invalid phone or timestamp.`);
                    continue;
                }

                const { firstName, lastName } = processDoctorName(FullName);
                const dr_name = firstName+" "+lastName;
                const fullName = dr_name.trim();


                const locationJson = JSON.stringify({ locality: row[3], latitude: row[18], longitude: row[19] });

                const existingDoctor = await pool.query("SELECT id, onboarding_date, last_meeting FROM doctors WHERE phone = $1", [phone]);
                const ndm_name = row[0].trim().toLowerCase();
                const getNDM = await pool.query("SELECT id FROM users WHERE first_name = $1 OR CONCAT(first_name,' ',last_name) = $1", [ndm_name]);
                if(getNDM.rows.length == 0)continue;
                let NDM = getNDM?.rows[0]?.id;
                if (existingDoctor?.rows?.length > 0) {
                    // UPDATE
                    const doc = existingDoctor.rows[0];
                    let newOnboarding = new Date(doc.onboarding_date) < timestamp ? new Date(doc.onboarding_date) : timestamp;
                    let newLastMeeting = new Date(doc.last_meeting) > timestamp ? new Date(doc.last_meeting) : timestamp;
                    if (doc.last_meeting > timestamp) {
                        NDM = doc.assigned_agent_id_offline;
                    }


                    await pool.query(
                        `UPDATE doctors SET onboarding_date = $1, last_meeting = $2, location = $3, gps_location_link = $4, updated_at = $6, assigned_agent_id_offline = $7 WHERE phone = $5`,
                        [newOnboarding, newLastMeeting, locationJson, row[14], phone, timestamp, NDM]
                    );
                    updatedDoctors.push({ phone });
                } else {
                    // INSERT
                    await pool.query(
                        `INSERT INTO doctors (first_name, phone, location, gps_location_link, onboarding_date, last_meeting, assigned_agent_id_offline) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                        [fullName, phone, locationJson, row[14], timestamp, timestamp, NDM]
                    );
                    processedDoctors.push({ phone });
                }

                const doctor = await pool.query("SELECT id FROM doctors WHERE phone = $1", [phone]);
                if (doctor?.rows[0]?.length == 0) continue;
                const photosJSON = JSON.stringify({
                    clinicImage:row[12],
                    selfieImage:row[13]
                })

                const meeting = await pool.query(
                    "INSERT INTO doctor_meetings (doctor_id,agent_id,meeting_type,duration,location,gps_location_link,meeting_notes,photos,gps_verified,meeting_summary,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)",
                    [doctor?.rows[0]?.id, NDM, "physical", row[6],locationJson,row[14],row[8],photosJSON,true,row[11],timestamp,timestamp]
                )

            } catch (error) {
                console.error(`[Row ${rowNumber}]: FAILED with error: ${error.message}`);
                failedRows.push({ rowNumber, reason: error.message });
            }
        }

        console.log("\n--- Batch Processing Complete ---");

        res.status(201).json(new apiResponse(201, {
            newly_created_count: processedDoctors.length,
            updated_count: updatedDoctors.length,
            failed_count: failedRows.length,
            failures: failedRows
        }, "Batch processing complete."));
    });
}