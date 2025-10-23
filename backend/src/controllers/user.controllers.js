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

    createUserBatchNDM = asyncHandler(async (req, res, next) => {
        // phone ndm_name role
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
        const created_at = new Date().toISOString();
        const updated_at = created_at;
        for (const ind in users) {
            const row = users[ind];
            const phone = process_phone_no(row[0]);
            const first_name = processString(row[1]);
            const last_name = processString(row[2]);
            const role = processString(row[3]);
            if (!phone || !first_name) continue;
            const newUser = await pool.query(
                "INSERT INTO USERS (PHONE,FIRST_NAME,LAST_NAME,CREATED_AT,UPDATED_AT, PASSWORD_HASH, ROLE) VALUES ( $1 , $2 , $3 , $4 , $5 , 'medpho', $6) RETURNING ID,PHONE; ",
                [phone, first_name, last_name, created_at, updated_at, role]
            );
            newUsers.push(newUser.rows);
        }

        res.status(201).json(new apiResponse(201, newUsers, "NDMs created successfully"));
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



