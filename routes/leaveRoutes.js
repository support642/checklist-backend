import express from "express";
import { transferTasks, getUserTasks, assignIndividualTasks } from "../controllers/leaveController.js";

const router = express.Router();

// POST /api/leave/transfer-tasks
router.post("/transfer-tasks", transferTasks);

// GET /api/leave/user-tasks - Fetch user tasks by date range
router.get("/user-tasks", getUserTasks);

// POST /api/leave/assign-individual-tasks - Assign individual tasks to different users
router.post("/assign-individual-tasks", assignIndividualTasks);

export default router;
