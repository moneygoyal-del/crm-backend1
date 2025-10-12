import { Router } from "express";
import userController from "../controllers/user.controllers.js";
import upload from "../middleware/multer.middleware.js"

const router = Router();

const UserController = new userController(); 

router.route("/create").post(UserController.createUser);
router.route("/createBatchNDM").post(upload.single('users'),UserController.createUserBatchNDM);
router.route("/delete").delete(UserController.deleteUser);
router.route("/update").put(UserController.updateUser);

export default router;