// controllers/settingController.js
import pool from "../config/db.js";

/*******************************
 * 1) GET USERS
 *******************************/
export const getUsers = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT *
      FROM users
      WHERE user_name IS NOT NULL
      ORDER BY id ASC
    `);

    res.json(result.rows);
  } catch (error) {
    console.error("❌ Error fetching users:", error);
    res.status(500).json({ error: "Database error" });
  }
};


/*******************************
 * 2) CREATE USER
 *******************************/
export const createUser = async (req, res) => {
  try {
    const {
      username,
      password,
      email,
      phone,
      department,
      givenBy,
      role,
      status,
      user_access
    } = req.body;

    const query = `
      INSERT INTO users (
        user_name, password, email_id, number, department,
        given_by, role, status, user_access
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      RETURNING *
    `;

    // Convert empty strings to null for fields that might be bigint or optional
    const values = [
      username || null,
      password || null,
      email || null,
      phone || null,  // number column is bigint, empty string causes error
      department || null,
      givenBy || null,
      role || 'employee',
      status || 'active',
      user_access || null
    ];

    const result = await pool.query(query, values);

    res.json(result.rows[0]);

  } catch (error) {
    console.error("❌ Error creating user:", error);
    res.status(500).json({ error: "Database error" });
  }
};


/*******************************
 * 3) UPDATE USER
 *******************************/
export const updateUser = async (req, res) => {
  try {
    const { id } = req.params;

    const {
      user_name,
      password,
      email_id,
      number,
      employee_id,
      role,
      status,
      user_access,
      department,
      given_by,
      leave_date,
      leave_end_date,
      remark
    } = req.body;

    const query = `
      UPDATE users SET
        user_name = $1,
        password = $2,
        email_id = $3,
        number = $4,
        employee_id = $5,
        role = $6,
        status = $7,
        user_access = $8,
        department = $9,
        given_by = $10,
        leave_date = $11,
        leave_end_date = $12,
        remark = $13
      WHERE id = $14
      RETURNING *
    `;

    const values = [
      user_name, password, email_id, number, employee_id,
      role, status, user_access, department, given_by,
      leave_date, leave_end_date, remark, id
    ];

    const result = await pool.query(query, values);

    res.json(result.rows[0]);

  } catch (error) {
    console.error("❌ Error updating user:", error);
    res.status(500).json({ error: "Database error" });
  }
};


/*******************************
 * 4) DELETE USER
 *******************************/
export const deleteUser = async (req, res) => {
  try {
    const { id } = req.params;

    await pool.query(`DELETE FROM users WHERE id = $1`, [id]);

    res.json({ message: "User deleted", id });

  } catch (error) {
    console.error("❌ Error deleting user:", error);
    res.status(500).json({ error: "Database error" });
  }
};


/*******************************
 * 5) GET ALL DEPARTMENTS
 *******************************/
export const getDepartments = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT DISTINCT department, given_by, id
      FROM users
      WHERE department IS NOT NULL AND department <> ''
      ORDER BY department ASC
    `);

    res.json(result.rows);

  } catch (error) {
    console.error("❌ Error fetching departments:", error);
    res.status(500).json({ error: "Database error" });
  }
};


/*******************************
 * 6) GET UNIQUE DEPARTMENTS ONLY
 *******************************/
export const getDepartmentsOnly = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT DISTINCT department
      FROM users
      WHERE department IS NOT NULL 
        AND department <> ''
      ORDER BY department ASC
    `);

    // Format the response
    const departments = result.rows.map(row => ({
      department: row.department
    }));

    res.json(departments);

  } catch (error) {
    console.error("❌ Error fetching unique departments:", error);
    res.status(500).json({ error: "Database error" });
  }
};


/*******************************
 * 7) GET UNIQUE GIVEN_BY VALUES
 *******************************/
export const getGivenByData = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT DISTINCT given_by
      FROM users
      WHERE given_by IS NOT NULL 
        AND given_by <> ''
      ORDER BY given_by ASC
    `);

    // Format the response
    const givenByList = result.rows.map(row => ({
      given_by: row.given_by
    }));

    res.json(givenByList);

  } catch (error) {
    console.error("❌ Error fetching given_by data:", error);
    res.status(500).json({ error: "Database error" });
  }
};


/*******************************
 * 8) CREATE DEPARTMENT
 *******************************/
export const createDepartment = async (req, res) => {
  try {
    const { name, givenBy } = req.body;

    const result = await pool.query(`
      INSERT INTO users (department, given_by)
      VALUES ($1, $2)
      RETURNING *
    `, [name, givenBy]);

    res.json(result.rows[0]);

  } catch (error) {
    console.log("❌ Error creating dept:", error);
    res.status(500).json({ error: "Database error" });
  }
};


/*******************************
 * 9) UPDATE DEPARTMENT
 *******************************/
export const updateDepartment = async (req, res) => {
  try {
    const { id } = req.params;
    const { department, given_by } = req.body;

    const result = await pool.query(`
      UPDATE users 
      SET department = $1, given_by = $2
      WHERE id = $3
      RETURNING *
    `, [department, given_by, id]);

    res.json(result.rows[0]);

  } catch (error) {
    console.error("❌ Error updating dept:", error);
    res.status(500).json({ error: "Database error" });
  }
};