import express from "express";
import { getCalendarTasks } from "../controllers/calendarController.js";

const router = express.Router();

// GET /api/calendar/tasks - Get all tasks for calendar
router.get("/tasks", getCalendarTasks);

export default router;
