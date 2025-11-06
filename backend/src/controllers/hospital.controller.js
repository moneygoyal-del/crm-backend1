import apiResponse from "../utils/apiResponse.utils.js";
import asyncHandler from "../utils/asynchandler.utils.js";
import { pool } from "../DB/db.js";
import apiError from "../utils/apiError.utils.js";

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

        const result = await pool.query(
            "SELECT hospital_name FROM crm.hospitals WHERE city = $1 ORDER BY hospital_name",
            [city]
        );

        const hospitals = result.rows.map(row => row.hospital_name);
        res.status(200).json(new apiResponse(200, hospitals, "Hospitals fetched successfully"));
    });
}