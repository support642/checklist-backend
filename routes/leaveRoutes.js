import express from "express";
import { transferTasks, getUserTasks, assignIndividualTasks, extendTask, deleteTask, bulkDeleteTasks } from "../controllers/leaveController.js";

const router = express.Router();

// POST /api/leave/transfer-tasks
router.post("/transfer-tasks", transferTasks);

// GET /api/leave/user-tasks - Fetch user tasks by date range
router.get("/user-tasks", getUserTasks);

// POST /api/leave/assign-individual-tasks - Assign individual tasks to different users
router.post("/assign-individual-tasks", assignIndividualTasks);

// POST /api/leave/extend-task - Extend task start date
router.post("/extend-task", extendTask);
// DELETE /api/leave/delete-task/:taskId - Delete a single task
router.delete("/delete-task/:taskId", deleteTask);

// POST /api/leave/bulk-delete-tasks - Bulk delete multiple tasks
router.post("/bulk-delete-tasks", bulkDeleteTasks);

export default router;
