import { Router } from "express";
import doctorController from "../controllers/doctor.controllers.js";
import upload from "../middleware/multer.middleware.js";
import { verifyJWT } from "../middleware/auth.middleware.js";

const router = Router();
const DoctorController = new doctorController();

// CREATE: Single doctor creation with meeting
router.route("/createByNdmName").post(DoctorController.createDoctorByName);

// CREATE: Batch upload routes
router.route("/createBatchDoctorsandMeetings").post(upload.single('doctors'), DoctorController.createDoctorBatchAndMeetings);
router.route("/createOnlineDoctors/:ndmPhone").post(upload.single('doctors'), DoctorController.createOnlineDoctors);

// UPDATE: Single doctor update
router.route("/update").put(DoctorController.updateDoctor);

// DELETE: Single doctor deletion
router.route("/delete").delete(DoctorController.deleteDoctor);


//DELETE: Delete a meeting by id
router.route("/deleteMeeting").delete(DoctorController.deleteDoctorMeeting);
// router.route("update").put();

router.route("/createBatchCallLogs").post(upload.single('calllogs'), DoctorController.createDoctorCallLogBatch);


router.route("/create-web").post(
    verifyJWT, 
    upload.fields([
        { name: 'clinic_photo', maxCount: 1 },
        { name: 'selfie_photo', maxCount: 1 }
    ]),
    DoctorController.createMeetingFromWeb
);

router.route("/upload-meeting-photo").post(
    verifyJWT,
    upload.single('document'), // 'document' is the form field name
    DoctorController.uploadMeetingPhoto
);

router.route("/get-by-phone/:phone").get(verifyJWT, DoctorController.getDoctorByPhone);

export default router;