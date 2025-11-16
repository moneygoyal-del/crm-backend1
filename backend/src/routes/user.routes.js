import { Router } from "express";
import userController from "../controllers/user.controllers.js";
import upload from "../middleware/multer.middleware.js"
import { verifyJWT } from "../middleware/auth.middleware.js";

const router = Router();

const UserController = new userController(); 

router.route("/create").post(verifyJWT,UserController.createUser);
router.route("/createBatchNDM").post(upload.single('users'),UserController.createUserBatchNDM);
router.route("/delete").delete(verifyJWT,UserController.deleteUser);
router.route("/update").put(verifyJWT,UserController.updateUser);

export default router;