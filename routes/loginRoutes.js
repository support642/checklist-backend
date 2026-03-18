// routes/loginRoutes.js
import express from "express";
import { loginUserController, authStream } from "../controllers/loginController.js";

const router = express.Router();

// POST /api/login
router.post("/", loginUserController);

// GET /api/login/stream?username=...
router.get("/stream", authStream);

export default router;
