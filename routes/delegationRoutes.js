import express from "express";
import {
  fetchDelegationDataSortByDate,
  fetchDelegation_DoneDataSortByDate,
  insertDelegationDoneAndUpdate,
  adminDoneDelegation
} from "../controllers/delegationController.js";

const router = express.Router();

router.get("/delegation", fetchDelegationDataSortByDate);
router.get("/delegation-done", fetchDelegation_DoneDataSortByDate);
router.post("/delegation/submit", insertDelegationDoneAndUpdate);
router.post("/delegation/admin-done", adminDoneDelegation);

export default router;
