import { Router } from "express";
import patientLeadController from "../controllers/patientLead.controller.js";
import upload from "../middleware/multer.middleware.js"
import { verifyJWT, verifyRole } from "../middleware/auth.middleware.js";

const router = Router();

const PatientLeadController = new patientLeadController(); 

router.route("/create").post(verifyJWT,PatientLeadController.createPatientLead);
router.route("/createBatchOPD").post(upload.single('leads'),PatientLeadController.createPatientLeadBatchUpload);
router.route("/createBatchDispositionLogs").post(upload.single('dispositions'),PatientLeadController.createDispositionLogBatchUpload); 
router.route("/delete").delete(verifyJWT,PatientLeadController.deletePatientLead);
router.route("/get-phone/:booking_reference").get(verifyJWT, PatientLeadController.getPatientPhoneByRef);
router.route("/update").put(verifyJWT,PatientLeadController.updatePatientLead);

router.route("/get-details/:booking_reference").get(verifyJWT, PatientLeadController.getPatientDetailsByRef);


router.route("/update-disposition").post(
    verifyJWT, 
    verifyRole(["operations", "super_admin"]), 
    PatientLeadController.updatePatientDisposition
);

router.route("/create-web").post(
    verifyJWT, 
    // Use upload.fields to accept two specific file fields
    upload.fields([
        { name: 'aadhar_document', maxCount: 1 },
        { name: 'pmjay_document', maxCount: 1 }
    ]),
    PatientLeadController.createOpdBookingFromWeb
);
router.route("/upload-document").post(
    verifyJWT,
    upload.single('document'), // 'document' is the name of the form field
    PatientLeadController.uploadOpdDocument
);

export default router;