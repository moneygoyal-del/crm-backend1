import apiResponse from "../utils/apiResponse.utils.js";
import asyncHandler from "../utils/asynchandler.utils.js";
import { pool } from "../DB/db.js";
import apiError from "../utils/apiError.utils.js";
import readCsvFile from "../helper/read_csv.helper.js"; 
import fs from "fs"; 

export default class hospitalController {

    /**
     * @description Get a unique list of all cities
     * @route GET /api/v1/hospitals/cities
     */
    getAllCities = asyncHandler(async (req, res) => {
        const result = await pool.query(
            "SELECT DISTINCT city FROM crm.hospitals ORDER BY city"
        );
        
        const cities = result.rows.map(row => row.city);
        res.status(200).json(new apiResponse(200, cities, "Cities fetched successfully"));
    });

    /**
     * @description Get all hospitals for a specific city
     * @route GET /api/v1/hospitals/by-city/:city
     */
    getHospitalsByCity = asyncHandler(async (req, res) => {
        const { city } = req.params;
        if (!city) {
            throw new apiError(400, "City parameter is required");
        }

        // MODIFIED: Select id AND hospital_name
        const result = await pool.query(
            "SELECT id, hospital_name FROM crm.hospitals WHERE city = $1 ORDER BY hospital_name",
            [city]
        );

        // MODIFIED: Return the full row object { id, hospital_name } instead of just mapping names
        // Do NOT use .map(row => row.hospital_name) here anymore.
        res.status(200).json(new apiResponse(200, result.rows, "Hospitals fetched successfully"));
    });

    /**
     * @description Create a single new hospital
     * @route POST /api/v1/hospitals/create
     */
    createHospital = asyncHandler(async (req, res) => {
        const { city, hospital_name, hospital_group_id, hospital_code } = req.body;

        if (!city || !hospital_name) {
            throw new apiError(400, "City and Hospital Name are required.");
        }

        const newHospital = await pool.query(
            `INSERT INTO crm.hospitals (city, hospital_name, hospital_group_id, hospital_code)
             VALUES ($1, $2, $3, $4)
             RETURNING id, city, hospital_name`,
            [city, hospital_name, hospital_group_id, hospital_code]
        );

        if (newHospital.rows.length === 0) {
            throw new apiError(500, "Failed to create hospital.");
        }

        res.status(201).json(new apiResponse(201, newHospital.rows[0], "Hospital created successfully"));
    });

    /**
     * @description Bulk upload hospitals from CSV
     * @route POST /api/v1/hospitals/create-batch
     */
    createHospitalBatch = asyncHandler(async (req, res) => {
        const file = req.file;
        if (!file) throw new apiError(400, "No file uploaded.");

        const csvData = await readCsvFile(file.path);

        // Asynchronously delete the temporary file
        fs.unlink(file.path, (err) => {
            if (err) console.error('Error deleting temp file:', err);
            else console.log('Temp file deleted successfully:', file.path);
        });

        const hospitalsToInsert = [];
        const failedRows = [];

        // Based on your sheet
        const colMap = { city: 0, hospital: 1, groupId: 2, code: 3 };

        for (const i in csvData) {
            const row = csvData[i];
            const rowNumber = Number(i) + 2; // CSVs are 1-indexed, +1 for header

            try {
                const city = row[colMap.city]?.trim();
                const hospital_name = row[colMap.hospital]?.trim();
                const hospital_group_id = row[colMap.groupId]?.trim() || null;
                const hospital_code = row[colMap.code]?.trim() || null;

                if (!city || !hospital_name) {
                    throw new Error("Missing required field: City or Hospital Name");
                }

                hospitalsToInsert.push(city, hospital_name, hospital_group_id, hospital_code);

            } catch (error) {
                failedRows.push({ rowNumber, reason: error.message, data: row });
            }
        }

        let createdCount = 0;
        if (hospitalsToInsert.length > 0) {
            const columns = ['city', 'hospital_name', 'hospital_group_id', 'hospital_code'];
            const rowLength = columns.length; // 4 columns

            // Generate placeholders: ($1, $2, $3, $4), ($5, $6, $7, $8), ...
            const valuePlaceholders = [];
            const totalRows = hospitalsToInsert.length / rowLength;
            for (let j = 0; j < totalRows; j++) {
                const placeholders = Array.from({ length: rowLength }, (_, k) => `$${j * rowLength + k + 1}`).join(', ');
                valuePlaceholders.push(`(${placeholders})`);
            }

            const bulkInsertQuery = `
                INSERT INTO crm.hospitals (${columns.join(', ')}) 
                VALUES ${valuePlaceholders.join(', ')}
            `;

            const result = await pool.query(bulkInsertQuery, hospitalsToInsert);
            createdCount = result.rowCount;
        }

        res.status(201).json(new apiResponse(201, {
            total_rows_in_csv: csvData.length,
            newly_created_count: createdCount,
            failed_count: failedRows.length,
            failures: failedRows
        }, "Hospital batch upload complete."));
    });
}