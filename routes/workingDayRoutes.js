import express from "express";
import { getWorkingDays, addWorkingDay, deleteWorkingDay } from "../controllers/workingDayController.js";

const router = express.Router();

// GET /api/working-days - Get all working days
router.get("/", getWorkingDays);

// POST /api/working-days - Add working day
router.post("/", addWorkingDay);

// DELETE /api/working-days/:id - Delete working day
router.delete("/:id", deleteWorkingDay);

export default router;
