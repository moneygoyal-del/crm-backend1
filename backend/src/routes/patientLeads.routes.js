import { Router } from "express";
import patientLeadController from "../controllers/patientLead.controller.js";
import upload from "../middleware/multer.middleware.js"

const router = Router();

const PatientLeadController = new patientLeadController(); 

router.route("/create").post(PatientLeadController.createPatientLead);
router.route("/createBatchOPD").post(upload.single('leads'),PatientLeadController.createPatientLeadBatchUpload);
router.route("/delete").delete(PatientLeadController.deletePatientLead);
router.route("/update").put(PatientLeadController.updatePatientLead);

export default router;