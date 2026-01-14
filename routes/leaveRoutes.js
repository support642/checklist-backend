import express from "express";
import { transferTasks } from "../controllers/leaveController.js";

const router = express.Router();

// POST /api/leave/transfer-tasks
router.post("/transfer-tasks", transferTasks);

export default router;
