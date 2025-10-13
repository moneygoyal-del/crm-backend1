import apiError from "../utils/apiError.utils.js";
import apiResponse from "../utils/apiResponse.utils.js";
import asyncHandler from "../utils/asynchandler.utils.js";
import { process_phone_no, parseTimestamp } from "../helper/preprocess_data.helper.js";
import { pool } from "../DB/db.js";
import readCsvFile from "../helper/read_csv.helper.js";
import fs from "fs";
import { processDoctorName } from "../helper/process_doctor_name.helper.js";

export default class doctorController {
    createDoctorBatch = asyncHandler(async (req, res, next) => {
        const file = req.file;
        if (!file) throw new apiError(400, "No file uploaded.");

        const doctorsCsvData = await readCsvFile(file.path);
        const processedDoctors = [];
        const updatedDoctors = [];
        const failedRows = [];

        console.log(`\n--- Starting Batch Doctor Upload: ${doctorsCsvData.length} rows to process ---`);

        for (let i = 0; i < doctorsCsvData.length; i++) {
            const row = doctorsCsvData[i];
            const rowNumber = i + 2; 

         
            console.log(`\n[Row ${rowNumber}]: Raw data received from parser:`, row);

            try {
                if (!row || row.length < 17) { // Check if row has enough columns
                    failedRows.push({ rowNumber, reason: "Row is empty or has too few columns" });
                    console.log(`[Row ${rowNumber}]: SKIPPED - Malformed or empty row.`);
                    continue;
                }

                const fullName = row[1];
                const phoneRaw = row[2];
                const dateOfMeeting = row[15];
                const timeOfMeeting = row[16];

                if (!fullName || !phoneRaw || !dateOfMeeting) {
                    failedRows.push({ rowNumber, reason: "Missing Name, Phone, or Date" });
                    console.log(`[Row ${rowNumber}]: SKIPPED - Essential data missing.`);
                    continue;
                }
                
                const fullTimestampString = `${dateOfMeeting} ${timeOfMeeting || '00:00:00'}`;
                const timestamp = parseTimestamp(fullTimestampString);
                const phone = process_phone_no(phoneRaw);
                
                if (!phone || !timestamp) {
                     failedRows.push({ rowNumber, reason: `Invalid data after processing (Phone: ${phoneRaw}, Timestamp: ${fullTimestampString})` });
                     console.log(`[Row ${rowNumber}]: SKIPPED - Invalid phone or timestamp.`);
                     continue;
                }

                const { firstName, lastName } = processDoctorName(fullName);
                const locationJson = JSON.stringify({ locality: row[3], gps_coordinates: `${row[18]}, ${row[19]}` });

                const existingDoctor = await pool.query("SELECT id, onboarding_date, last_meeting FROM doctors WHERE phone = $1", [phone]);

                if (existingDoctor.rows.length > 0) {
                    // UPDATE
                    const doc = existingDoctor.rows[0];
                    let newOnboarding = new Date(doc.onboarding_date) < timestamp ? new Date(doc.onboarding_date) : timestamp;
                    let newLastMeeting = new Date(doc.last_meeting) > timestamp ? new Date(doc.last_meeting) : timestamp;

                    await pool.query(
                        `UPDATE doctors SET onboarding_date = $1, last_meeting = $2, location = $3, gps_location_link = $4, updated_at = NOW() WHERE phone = $5`,
                        [newOnboarding, newLastMeeting, locationJson, row[14], phone]
                    );
                    updatedDoctors.push({ phone });
                    console.log(`[Row ${rowNumber}]: SUCCESS - Updated doctor with phone ${phone}.`);
                } else {
                    // INSERT
                    await pool.query(
                        `INSERT INTO doctors (first_name, last_name, phone, location, gps_location_link, onboarding_date, last_meeting) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                        [firstName, lastName, phone, locationJson, row[14], timestamp, timestamp]
                    );
                    processedDoctors.push({ phone });
                    console.log(`[Row ${rowNumber}]: SUCCESS - Created new doctor with phone ${phone}.`);
                }

            } catch (error) {
                console.error(`[Row ${rowNumber}]: FAILED with error: ${error.message}`);
                failedRows.push({ rowNumber, reason: error.message });
            }
        }

        fs.unlinkSync(file.path);
        console.log("\n--- Batch Processing Complete ---");

        res.status(201).json(new apiResponse(201, {
            newly_created_count: processedDoctors.length,
            updated_count: updatedDoctors.length,
            failed_count: failedRows.length,
            failures: failedRows
        }, "Batch processing complete."));
    });
}