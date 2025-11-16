import { Router } from "express";
import hospitalController from "../controllers/hospital.controller.js";
import { verifyJWT } from "../middleware/auth.middleware.js"; 
import upload from "../middleware/multer.middleware.js"; 

const router = Router();
const HospitalController = new hospitalController(); 

router.route("/cities").get(HospitalController.getAllCities);
router.route("/by-city/:city").get(HospitalController.getHospitalsByCity);


router.route("/create").post(verifyJWT,HospitalController.createHospital);


router.route("/create-batch").post(upload.single('hospitals'),HospitalController.createHospitalBatch);

export default router;