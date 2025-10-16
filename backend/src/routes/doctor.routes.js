import { Router } from "express";
import doctorController from "../controllers/doctor.controllers.js";
import upload from "../middleware/multer.middleware.js";

const router = Router();
const DoctorController = new doctorController();


router.route("/createBatchDoctorsandMeetings").post(upload.single('doctors'), DoctorController.createDoctorBatchAndMeetings);

// router.route("create").post();
// router.route("delete").delete();
// router.route("update").put();

export default router;