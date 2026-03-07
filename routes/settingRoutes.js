// routes/settingRoutes.js
import express from "express";
import {
  getUsers,
  createUser,
  updateUser,
  deleteUser,
  getDepartments,
  getDepartmentsOnly,
  getGivenByData,
  createDepartment,
  updateDepartment,
  getMachines,
  createMachine,
  updateMachine,
  deleteMachine
} from "../controllers/settingController.js";

const router = express.Router();

// USERS
router.get("/users", getUsers);
router.post("/users", createUser);
router.put("/users/:id", updateUser);
router.delete("/users/:id", deleteUser);

// DEPARTMENTS
router.get("/departments", getDepartments); // Gets all departments with given_by
router.get("/departments-only", getDepartmentsOnly); // Gets only unique department names
router.get("/given-by", getGivenByData); // Gets only unique given_by values
router.post("/departments", createDepartment);
router.put("/departments/:id", updateDepartment);

// MACHINES
router.get("/machines", getMachines);
router.post("/machines", createMachine);
router.put("/machines/:id", updateMachine);
router.delete("/machines/:id", deleteMachine);

export default router;