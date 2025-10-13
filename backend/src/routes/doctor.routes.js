import { Router } from "express";
import doctorController from "../controllers/doctor.controllers.js";
import upload from "../middleware/multer.middleware.js";

const router = Router();
const DoctorController = new doctorController();


router.route("/createBatch").post(upload.single('doctors'), DoctorController.createDoctorBatch);

// router.route("create").post();
// router.route("delete").delete();
// router.route("update").put();

export default router;