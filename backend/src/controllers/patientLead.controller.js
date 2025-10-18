import apiError from "../utils/apiError.utils.js";
import apiResponse from "../utils/apiResponse.utils.js";
import asyncHandler from "../utils/asynchandler.utils.js";
import { process_phone_no, parseTimestamp, processString, processTimeStamp } from "../helper/preprocess_data.helper.js";
import { pool } from "../DB/db.js";
import readCsvFile from "../helper/read_csv.helper.js";
import fs from "fs";


export default class patientLeadController {
    createPatientLead = asyncHandler((req, res, next) => {

    });

    createPatientLeadBatchUpload = asyncHandler(async (req, res, next) => {
        const file = req.file;
        if (!file) throw new apiError(400, "No file uploaded.");

        const patientLeads = await readCsvFile(file.path);

        fs.unlink(file.path, (err) => {
            if (err) {
                console.error('Error deleting file:', err);
            } else {
                console.log('File deleted successfully:', file.path);
            }
        });

        const data = [];

        for(const i in patientLeads){
            try {
                const row = patientLeads[i];
                const city = processString(row[0]); 
                const hospital_name = processString(row[1]);
                const ndm_contact = row[2];
                const refree_name = row[3];
                const refree_phone_no = row[4];
                const patient_name = row[5];
                const patient_phone = row[6];
                const _age = row[7];
                const age = _age == "N/A"?null:_age;
                const gender = row[8];
                const medical_condition = row[9];
                const panel = row[10];
                const credits = row[11];
                const timestamp = processTimeStamp(row[12]);
                const booking_reference = row[13];
                const tentative_visit_date = processTimeStamp(row[14]);
                const source = row[15];
                const current_disposition = row[16];
                const patient_diposition_last_update = processTimeStamp(row[17]);
                
                if(!refree_phone_no)continue;
                const doctor = await pool.query("SELECT id FROM doctors WHERE phone = $1",[refree_phone_no]);
                if(doctor?.rows?.length == 0)continue;
                const refree_id = doctor?.rows?.id;
                
                if(!ndm_contact)continue;
                const ndm = await pool.query("SELECT id FROM users WHERE phone = $1",[ndm_contact]);
                if(ndm?.rows?.length == 0)continue;
                const created_by_agent_id = ndm?.rows?.id;
                
                
                const created_at = new Date().toISOString(); 
                if(!tentative_visit_date)continue;           
                const appointment_date = tentative_visit_date.split("T")[0];  
                //save the opd
                const newOPD = await pool.query(
                    "INSERT INTO opd_bookings (booking_reference,patient_name,patient_phone,age,gender,medical_condition,hospital_name,appointment_date,current_disposition,created_by_agent_id,last_interaction_date,source,referee_id,created_at,updated_at, payment_mode) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16) RETURNING id,booking_reference ",
                    [booking_reference,patient_name,patient_phone,age,gender,medical_condition,hospital_name,appointment_date,current_disposition,created_by_agent_id,patient_diposition_last_update,"doctor",refree_id,created_at,created_at, panel]
                )
                data.push(newOPD.rows[0]);
            } catch (error) {
                console.log(error);
            }
        }

        res.status(201).json(new apiResponse(201,data,"Opd Bookings successfully loaded"));

    });


    updatePatientLead = asyncHandler((req, res, next) => {

    });


    deletePatientLead = asyncHandler((req, res, next) => {

    });
}