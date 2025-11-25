import apiError from "../utils/apiError.utils.js"
import apiResponse from "../utils/apiResponse.utils.js"
import asyncHandler from "../utils/asynchandler.utils.js"
import { process_phone_no, processString, getIndianTimeISO } from "../helper/preprocess_data.helper.js"
import { pool } from "../DB/db.js"
import readCsvFile from "../helper/read_csv.helper.js"
import fs from "fs"
import { logAudit } from "../utils/auditLogger.util.js"

export default class userController {
    createUser = asyncHandler(async (req, res, next) => {
        let { email, first_name, last_name, phone, secondary_phone, team_id, role, gender } = req.body;

        email = processString(email);
        first_name = processString(first_name);
        last_name = processString(last_name);
        gender = processString(gender);
        role = processString(role);
        if (!role) role = "agent";

        const phone_processed = process_phone_no(phone);

        let secondary_phone_processed = null;
        if (secondary_phone && String(secondary_phone).trim()) {
            secondary_phone_processed = process_phone_no(secondary_phone);
        }

       
        const created_at = getIndianTimeISO();
        const updated_at = created_at;

        if (!phone_processed || !first_name) throw new apiError(400, "First name and phone number are required");
        
        const newUser = await pool.query(
            `INSERT INTO USERS (EMAIL, FIRST_NAME, LAST_NAME, PHONE, SECONDARY_PHONE, TEAM_ID, CREATED_AT, UPDATED_AT, PASSWORD_HASH, ROLE, GENDER) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'medpho', $9, $10) 
             RETURNING ID, PHONE;`,
            [
                email, first_name, last_name, phone_processed, secondary_phone_processed, 
                team_id, created_at, updated_at, role, gender 
            ]
        );

        if (!newUser.rows) throw new apiError(500, "Failed to create new user");
        const createdUserId = newUser.rows[0].id;

        if (req.user) {
            await logAudit(req.user.id, 'USER_CREATED', 'user', createdUserId, { newUserName: first_name, role: role });
        }

        res.status(201).json(new apiResponse(200, newUser.rows, "User successfully created"));
    })

    createUserBatchNDM = asyncHandler(async (req, res, next) => {
        const file = req.file;
        if (!file) throw new apiError(400, "No file uploaded.");

        const users = await readCsvFile(file.path);

        
        fs.unlink(file.path, (err) => {
            if (err) console.error("Error deleting temp file:", err);
        });

        const newUsers = [];
        const failedRows = [];
        
        
        const created_at = getIndianTimeISO();
        const updated_at = created_at;

        for (const ind in users) {
            const row = users[ind];
            const rowNumber = Number(ind) + 2; 

            try {
                
                
                const first_name = processString(row[0]);
                const last_name = processString(row[1]);
                const gender = processString(row[2]);
                const phone = process_phone_no(row[3]);
                const secondary_phone_raw = row[4];
                const role = processString(row[5]);
                
                
                const statusString = processString(row[6]); 
                const is_active = statusString === 'active'; 

                if (!phone || !first_name) throw new Error("Missing required fields (First Name or Phone)");

                let secondary_phone_processed = null;
                if (secondary_phone_raw && secondary_phone_raw.trim()) {
                    try { secondary_phone_processed = process_phone_no(secondary_phone_raw); } catch (e) {}
                }

               
                const newUser = await pool.query(
                    `INSERT INTO USERS (
                        FIRST_NAME, LAST_NAME, GENDER, PHONE, SECONDARY_PHONE, 
                        ROLE, IS_ACTIVE, CREATED_AT, UPDATED_AT, PASSWORD_HASH
                    ) 
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'medpho') 
                     RETURNING ID, PHONE;`,
                    [
                        first_name, 
                        last_name, 
                        gender, 
                        phone, 
                        secondary_phone_processed, 
                        role, 
                        is_active,  
                        created_at, 
                        updated_at
                    ]
                );
                newUsers.push(newUser.rows[0]);

            } catch (error) {
                failedRows.push({ rowNumber, reason: error.message });
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
        if (!id && !phone) throw new apiError(400, "Provide id or phone number");

        const deleteUser = await pool.query("DELETE FROM USERS WHERE ID = $1 OR PHONE = $2 RETURNING id, phone, first_name", [id, phone]);

        if (deleteUser.rowCount == 0) throw new apiError(404, "User not found");
        const deletedUser = deleteUser.rows[0];
        
        if (req.user) {
            await logAudit(req.user.id, 'USER_DELETED', 'user', deletedUser.id, { phone: deletedUser.phone });
        }

        res.status(200).json(new apiResponse(200, deleteUser.rows[0], "User successfully deleted"));
    })


    updateUser = asyncHandler(async (req, res, next) => {
        const { id } = req.body; 
        let { email, first_name, last_name, phone, secondary_phone, team_id, role, is_active, gender } = req.body;

        if (!id) throw new apiError(400, "User 'id' is required");

        
        const updated_at = getIndianTimeISO();
        const updateFields = [];
        const queryParams = [];
        let paramIndex = 1;

        const addField = (value, dbColumn, processor = null) => {
            if (value !== undefined) {
                let processedValue = value;
                if (processor) processedValue = processor(value);
                if(processedValue === '') processedValue = null;
                updateFields.push(`${dbColumn} = $${paramIndex++}`);
                queryParams.push(processedValue);
            }
        };

        addField(email, 'email', processString);
        addField(first_name, 'first_name', processString);
        addField(last_name, 'last_name', processString);
        addField(gender, 'gender', processString);
        addField(team_id, 'team_id');
        addField(role, 'role', processString);
        addField(is_active, 'is_active'); 

        if (phone !== undefined) {
            if(!phone) throw new apiError(400, "Primary phone cannot be set to empty.");
            updateFields.push(`phone = $${paramIndex++}`);
            queryParams.push(process_phone_no(phone));
        }
        
        if (secondary_phone !== undefined) {
            let secondary_phone_processed = null;
            if (secondary_phone && String(secondary_phone).trim()) {
                secondary_phone_processed = process_phone_no(secondary_phone);
            }
            updateFields.push(`secondary_phone = $${paramIndex++}`);
            queryParams.push(secondary_phone_processed); 
        }

        if (updateFields.length === 0) throw new apiError(400, "No valid fields provided");

        updateFields.push(`updated_at = $${paramIndex++}`);
        queryParams.push(updated_at);

        queryParams.push(id);
        
        const updateQuery = `UPDATE users SET ${updateFields.join(', ')} WHERE id = $${paramIndex} RETURNING id, phone, first_name, updated_at`;

        const updatedUser = await pool.query(updateQuery, queryParams);
        if (updatedUser.rowCount === 0) throw new apiError(404, "User not found");

        res.status(200).json(new apiResponse(200, updatedUser.rows[0], "User successfully updated"));
    })
}