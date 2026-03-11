import express from "express";
import {
  bulkImportChecklist,
  bulkImportDelegation,
  bulkImportMaintenance
} from "../controllers/importController.js";

const router = express.Router();

// Bulk import routes
router.post("/checklist", bulkImportChecklist);
router.post("/delegation", bulkImportDelegation);
router.post("/maintenance", bulkImportMaintenance);

export default router;
