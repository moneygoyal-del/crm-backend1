import apiError from "../utils/apiError.utils.js"
import apiResponse from "../utils/apiResponse.utils.js"
import asyncHandler from "../utils/asynchandler.utils.js"
import { process_phone_no, processString } from "../helper/preprocess_data.helper.js"
import { pool } from "../DB/db.js"
import readCsvFile from "../helper/read_csv.helper.js"
import fs from "fs"

export default class userController {
    createUser = asyncHandler(async (req, res, next) => {
        let { email, first_name, last_name, phone, team_id, role } = req.body;

        //processing and validating the data fields 
        email = processString(email);
        first_name = processString(first_name);
        last_name = processString(last_name);

        role = processString(role);
        if (!role) role = "agent";

        phone = process_phone_no(phone);

        const created_at = new Date();
        const updated_at = created_at;
        console.log(created_at)

        if (!phone || !first_name) {
            throw new apiError(400, "First name and phone number are required to create a new user");
        }
        const newUser = await pool.query(
            "INSERT INTO USERS (EMAIL,FIRST_NAME,LAST_NAME,PHONE,TEAM_ID,CREATED_AT,UPDATED_AT, PASSWORD_HASH, ROLE) VALUES ( $1 , $2 , $3 , $4 , $5 , $6 , $7 , 'medpho', $8) RETURNING ID,PHONE; ",
            [email, first_name, last_name, phone, team_id, created_at, updated_at, role]
        );

        if (!newUser.rows) {
            throw new apiError(500, "Failed to create new user in database");
        }

        res.status(201).json(new apiResponse(200, newUser.rows, "User successfully created"));
    })

    // BATCH: Create User Batch (NDM) 
   createUserBatchNDM = asyncHandler(async (req, res, next) => {
    const file = req.file;
    const usersData = await readCsvFile(file.path);

    fs.unlink(file.path, (err) => {
        if (err) {
            console.error('Error deleting file:', err);
        } else {
            console.log('File deleted successfully:', file.path);
        }
    });
    
    const startTime = Date.now();
    const usersToInsert = [];
    const failedRows = [];
    const created_at = new Date().toISOString();
    const updated_at = created_at;
    
    // --- PASS 1: VALIDATION AND DATA COLLECTION (LOCAL PROCESSING) ---
    for (let i = 0; i < usersData.length; i++) {
        const row = usersData[i];
        const rowNumber = i + 2; 

        try {
            // CSV columns: [0] phone, [1] first_name, [2] last_name, [3] role
            const phone = process_phone_no(row[0]);
            const first_name = processString(row[1]);
            const last_name = processString(row[2]);
            const role = processString(row[3]);
            
            if (!phone || !first_name) {
                throw new Error("First name or phone number is missing/invalid.");
            }
            
            // Collect all parameters for the final bulk insert query
            usersToInsert.push(
                phone, first_name, last_name, created_at, updated_at, role
            );
        } catch (error) {
            console.error(`[Row ${rowNumber}]: FAILED with error: ${error.message}`);
            failedRows.push({ rowNumber: rowNumber, reason: error.message });
        }
    }

    let newlyCreatedCount = 0;
    
    // --- PASS 2: BULK INSERTION (SINGLE DB QUERY) ---
    if (usersToInsert.length > 0) {
        const columns = ['phone', 'first_name', 'last_name', 'created_at', 'updated_at', 'role'];
        const rowLength = columns.length; // 6 columns per row
        const passwordHashValue = "'medpho'"; // Hardcoded password hash is the same for all

        // Generate placeholders: ($1, $2, $3, $4, $5, 'medpho'), ($7, $8, $9, $10, $11, 'medpho'), ...
        const valuePlaceholders = usersToInsert
            .map((_, i) => i + 1)
            .reduce((acc, v, i) => {
                if (i % rowLength === 0) {
                    const placeholders = Array.from({ length: rowLength - 1 }, (_, j) => `$${v + j}`).join(', ');
                    acc.push(`(${placeholders}, ${passwordHashValue})`);
                }
                return acc;
            }, [])
            .join(', ');
            
        // Remove the hardcoded password value from the parameters array before execution (it's in the query)
        const parametersWithoutPassword = usersToInsert.filter((_, i) => (i + 1) % rowLength !== 0);

        const bulkInsertQuery = `
            INSERT INTO USERS (PHONE, FIRST_NAME, LAST_NAME, CREATED_AT, UPDATED_AT, PASSWORD_HASH, ROLE) 
            VALUES ${valuePlaceholders}
            RETURNING ID, PHONE
        `;
        
        const result = await pool.query(bulkInsertQuery, parametersWithoutPassword);
        newlyCreatedCount = result.rowCount;
    }

    // --- FINAL TIME TRACKING AND RESPONSE ---
    const endTime = Date.now();
    const totalTimeSeconds = (endTime - startTime) / 1000;
    
    console.log(`\n--- Batch Processing Complete ---`);
    console.log(`Processed ${usersData.length} rows in ${totalTimeSeconds.toFixed(2)} seconds.`);
    console.log(`Successes: ${newlyCreatedCount}, Failures: ${failedRows.length}.`);

    res.status(201).json(new apiResponse(201, {
        newly_created_count: newlyCreatedCount,
        failed_count: failedRows.length,
        failures: failedRows,
    }, "NDMs created successfully"));
});


    deleteUser = asyncHandler(async (req, res, next) => {
        const { id, phone } = req.body;

        if (!id && !phone) {
            throw new apiError(400, "Provide id or phone number of the user to delete");
        }

        const deleteUser = await pool.query(
            "DELETE FROM USERS WHERE ID = $1 OR PHONE = $2 ",
            [id, phone]
        );

        if (deleteUser.rowCount == 0) {
            throw new apiError(500, "Failed to delete user");
        }

        res.status(200).json(new apiResponse(200, deleteUser.rows, "User successfully deleted"));
    })


    updateUser = asyncHandler(async (req, res, next) => {
        const { id, email, first_name, last_name, phone, team_id, } = req.body;
        const created_at = new Date();
        const updated_at = created_at;

        if (!phone || !first_name) {
            throw new apiError(400, "First name and phone number are required to create a new user");
        }
        const updatedUser = await pool.query(
            "INSERT INTO TABLE COLUMNS(EMAIL,FIRST_NAME,LAST_NAME,PHONE,TEAM_ID,CREATED_AT,UPDATED_AT, PASSWORD_HASH) VALUES ( $1 , $2 , $3 , $4 , $5 , $6 , $7 , 'medpho'); RETURNING ID,EMAIL,FIRST_NAME,LAST_NAME,PHONE,TEAM_ID,CREATED_AT,UPDATED_AT",
            [email, first_name, last_name, phone, team_id, created_at, updated_at]
        );

        if (!updatedUser.rows) {
            throw new apiError(500, "Failed to create new user in database");
        }

        res.status(200).json(new apiResponse(200, updatedUser.rows, "User successfully updated"));
    })
}



