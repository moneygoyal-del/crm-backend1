import { Router } from "express";
import authController from "../controllers/auth.controller.js";

const router = Router();
const AuthController = new authController(); 

router.route("/send-otp").post(AuthController.sendOtp);
router.route("/verify-otp").post(AuthController.verifyOtp);
router.route("/refresh").post(AuthController.handleRefreshToken);

export default router;