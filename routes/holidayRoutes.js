import express from "express";
import { getHolidays, addHoliday, deleteHoliday } from "../controllers/holidayController.js";

const router = express.Router();

// GET /api/holidays - Get all holidays
router.get("/", getHolidays);

// POST /api/holidays - Add holiday
router.post("/", addHoliday);

// DELETE /api/holidays/:id - Delete holiday
router.delete("/:id", deleteHoliday);

export default router;
