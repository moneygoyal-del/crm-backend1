import apiError from "../utils/apiError.utils.js"
import apiResponse from "../utils/apiResponse.utils.js"
import asyncHandler from "../utils/asynchandler.utils.js"
import { process_phone_no, processString } from "../helper/preprocess_data.helper.js"
import { pool } from "../DB/db.js"
import readCsvFile from "../helper/read_csv.helper.js"
import fs from "fs"

export default class userController {
    createUser = asyncHandler(async (req, res, next) => {
        let { email, first_name, last_name, phone, secondary_phone, team_id, role } = req.body;

        //processing and validating the data fields 
        email = processString(email);
        first_name = processString(first_name);
        last_name = processString(last_name);

        role = processString(role);
        if (!role) role = "agent";

        // Process primary phone (required)
        const phone_processed = process_phone_no(phone);

        // Process secondary phone (optional)
        let secondary_phone_processed = null;
        if (secondary_phone && String(secondary_phone).trim()) {
            secondary_phone_processed = process_phone_no(secondary_phone);
        }

        const created_at = new Date();
        const updated_at = created_at;

        if (!phone_processed || !first_name) {
            throw new apiError(400, "First name and phone number are required to create a new user");
        }
        const newUser = await pool.query(
            `INSERT INTO USERS (EMAIL,FIRST_NAME,LAST_NAME,PHONE,SECONDARY_PHONE,TEAM_ID,CREATED_AT,UPDATED_AT, PASSWORD_HASH, ROLE) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'medpho', $9) 
             RETURNING ID,PHONE;`,
            [email, first_name, last_name, phone_processed, secondary_phone_processed, team_id, created_at, updated_at, role]
        );

        if (!newUser.rows) {
            throw new apiError(500, "Failed to create new user in database");
        }

        res.status(201).json(new apiResponse(200, newUser.rows, "User successfully created"));
    })

    // BATCH: Create User Batch (NDM) 
    createUserBatchNDM = asyncHandler(async (req, res, next) => {
        // ASSUMED CSV FORMAT:
        // [0] phone
        // [1] first_name
        // [2] last_name
        // [3] role
        // [4] secondary_phone (NEW)

        const file = req.file;
        const users = await readCsvFile(file.path);

        fs.unlink(file.path, (err) => {
            if (err) {
                console.error('Error deleting file:', err);
            } else {
                console.log('File deleted successfully:', file.path);
            }
        });

        const newUsers = [];
        const failedRows = [];
        const created_at = new Date().toISOString();
        const updated_at = created_at;

        for (const ind in users) {
            const row = users[ind];
            const rowNumber = Number(ind) + 2; // For error reporting

            try {
                const phone = process_phone_no(row[0]);
                const first_name = processString(row[1]);
                const last_name = processString(row[2]);
                const role = processString(row[3]);
                const secondary_phone_raw = row[4]; // Get the new column

                if (!phone || !first_name) {
                    throw new Error("Missing required fields: phone or first_name");
                }

                // Process secondary phone (optional)
                let secondary_phone_processed = null;
                if (secondary_phone_raw && secondary_phone_raw.trim()) {
                    try {
                        secondary_phone_processed = process_phone_no(secondary_phone_raw);
                    } catch (e) {
                        console.warn(`[Row ${rowNumber}]: Skipping invalid secondary phone '${secondary_phone_raw}' for primary phone ${phone}.`);
                        // secondary_phone_processed remains null
                    }
                }

                const newUser = await pool.query(
                    `INSERT INTO USERS (PHONE,FIRST_NAME,LAST_NAME,SECONDARY_PHONE,CREATED_AT,UPDATED_AT, PASSWORD_HASH, ROLE) 
                     VALUES ($1, $2, $3, $4, $5, $6, 'medpho', $7) 
                     RETURNING ID,PHONE;`,
                    [phone, first_name, last_name, secondary_phone_processed, created_at, updated_at, role]
                );
                newUsers.push(newUser.rows[0]);

            } catch (error) {
                failedRows.push({ rowNumber, reason: error.message, data: row });
                console.error(`[Row ${rowNumber}]: FAILED with error: ${error.message}`);
            }
        }

        res.status(201).json(new apiResponse(201, {
            newly_created_count: newUsers.length,
            failed_count: failedRows.length,
            newUsers: newUsers,
            failures: failedRows
        }, "NDMs batch creation complete."));
    });


    deleteUser = asyncHandler(async (req, res, next) => {
        const { id, phone } = req.body;

        if (!id && !phone) {
            throw new apiError(400, "Provide id or phone number of the user to delete");
        }

        const deleteUser = await pool.query(
            "DELETE FROM USERS WHERE ID = $1 OR PHONE = $2 RETURNING id, phone, first_name",
            [id, phone]
        );

        if (deleteUser.rowCount == 0) {
            throw new apiError(404, "User not found or failed to delete");
        }

        res.status(200).json(new apiResponse(200, deleteUser.rows[0], "User successfully deleted"));
    })


    updateUser = asyncHandler(async (req, res, next) => {
        // NOTE: This function was rewritten to perform a correct UPDATE
        const { id } = req.body; // Identifier
        let { email, first_name, last_name, phone, secondary_phone, team_id, role, is_active } = req.body; // Data

        if (!id) {
            throw new apiError(400, "User 'id' is required to identify which user to update.");
        }

        const updated_at = new Date().toISOString();
        const updateFields = [];
        const queryParams = [];
        let paramIndex = 1;

        // Helper to add fields dynamically
        const addField = (value, dbColumn, processor = null) => {
            if (value !== undefined) {
                let processedValue = value;
                if (processor) {
                    processedValue = processor(value);
                }
                // Allow setting fields to null if an empty string is passed
                if(processedValue === '') processedValue = null;

                updateFields.push(`${dbColumn} = $${paramIndex++}`);
                queryParams.push(processedValue);
            }
        };

        addField(email, 'email', processString);
        addField(first_name, 'first_name', processString);
        addField(last_name, 'last_name', processString);
        addField(team_id, 'team_id');
        addField(role, 'role', processString);
        addField(is_active, 'is_active'); // Expects a boolean

        // --- Special Phone Handling ---
        if (phone !== undefined) {
            if(!phone) throw new apiError(400, "Primary phone cannot be set to empty.");
            updateFields.push(`phone = $${paramIndex++}`);
            queryParams.push(process_phone_no(phone));
        }
        
        if (secondary_phone !== undefined) {
            let secondary_phone_processed = null;
            // Only process if it's not an empty string
            if (secondary_phone && String(secondary_phone).trim()) {
                secondary_phone_processed = process_phone_no(secondary_phone);
            }
            updateFields.push(`secondary_phone = $${paramIndex++}`);
            queryParams.push(secondary_phone_processed); // Will be null if empty
        }

        if (updateFields.length === 0) {
            throw new apiError(400, "No valid fields provided for update.");
        }

        // Add mandatory updated_at field
        updateFields.push(`updated_at = $${paramIndex++}`);
        queryParams.push(updated_at);

        // Add the ID for the WHERE clause
        queryParams.push(id);
        
        const updateQuery = `
            UPDATE users 
            SET ${updateFields.join(', ')} 
            WHERE id = $${paramIndex}
            RETURNING id, phone, first_name, updated_at
        `;

        const updatedUser = await pool.query(updateQuery, queryParams);

        if (updatedUser.rowCount === 0) {
            throw new apiError(404, "User not found or failed to update.");
        }

        res.status(200).json(new apiResponse(200, updatedUser.rows[0], "User successfully updated"));
    })
}