import { Router } from "express";
import hospitalController from "../controllers/hospital.controller.js";

const router = Router();
const HospitalController = new hospitalController(); 

// Public routes to get hospital data
router.route("/cities").get(HospitalController.getAllCities);
router.route("/by-city/:city").get(HospitalController.getHospitalsByCity);

export default router;