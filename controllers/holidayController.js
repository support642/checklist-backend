import pool from "../config/db.js";

// -----------------------------------------
// GET ALL HOLIDAYS
// -----------------------------------------
export const getHolidays = async (req, res) => {
  try {
    const query = `
      SELECT * FROM holiday_list
      ORDER BY holiday_date ASC
    `;
    const { rows } = await pool.query(query);
    res.json({ data: rows });
  } catch (error) {
    console.error("❌ Error fetching holidays:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

// -----------------------------------------
// ADD HOLIDAY
// Also deletes matching date from working_day_calender
// -----------------------------------------
export const addHoliday = async (req, res) => {
  const client = await pool.connect();
  
  try {
    const { holiday_date, remarks } = req.body;
    
    if (!holiday_date) {
      return res.status(400).json({ error: "Holiday date is required" });
    }

    await client.query("BEGIN");

    // 1. Insert into holiday_list
    const insertQuery = `
      INSERT INTO holiday_list (holiday_date, remarks)
      VALUES ($1, $2)
      RETURNING *
    `;
    const { rows } = await client.query(insertQuery, [holiday_date, remarks || ""]);

    // 2. Delete from working_day_calender where date matches
    const deleteQuery = `
      DELETE FROM working_day_calender
      WHERE working_date = $1
    `;
    await client.query(deleteQuery, [holiday_date]);

    await client.query("COMMIT");

    res.json({
      message: "Holiday added successfully",
      data: rows[0],
      deletedFromWorkingDays: true
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("❌ Error adding holiday:", error);
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
};

// -----------------------------------------
// DELETE HOLIDAY
// -----------------------------------------
export const deleteHoliday = async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!id) {
      return res.status(400).json({ error: "Holiday ID is required" });
    }

    const query = `
      DELETE FROM holiday_list
      WHERE id = $1
      RETURNING *
    `;
    const { rows } = await pool.query(query, [id]);

    if (rows.length === 0) {
      return res.status(404).json({ error: "Holiday not found" });
    }

    res.json({
      message: "Holiday deleted successfully",
      data: rows[0]
    });
  } catch (error) {
    console.error("❌ Error deleting holiday:", error);
    res.status(500).json({ error: error.message });
  }
};
