import pool from "../config/db.js";

// -----------------------------------------
// GET ALL WORKING DAYS
// -----------------------------------------
export const getWorkingDays = async (req, res) => {
  try {
    const { month, year } = req.query;
    
    let where = "1=1";
    const params = [];
    
    if (month) {
      params.push(parseInt(month));
      where += ` AND month = $${params.length}`;
    }
    
    if (year) {
      params.push(parseInt(year));
      where += ` AND EXTRACT(YEAR FROM working_date) = $${params.length}`;
    }

    const query = `
      SELECT * FROM working_day_calender
      WHERE ${where}
      ORDER BY working_date ASC
    `;
    const { rows } = await pool.query(query, params);
    res.json({ data: rows });
  } catch (error) {
    console.error("❌ Error fetching working days:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

// -----------------------------------------
// ADD WORKING DAY
// -----------------------------------------
export const addWorkingDay = async (req, res) => {
  try {
    const { working_date, day, week_num, month } = req.body;
    
    if (!working_date) {
      return res.status(400).json({ error: "Working date is required" });
    }

    // Calculate day, week_num, month from date if not provided
    const date = new Date(working_date);
    const dayNames = ['रवि', 'सोम', 'मंगल', 'बुध', 'गुरु', 'शुक्र', 'शनि'];
    const calculatedDay = day || dayNames[date.getDay()];
    const calculatedWeekNum = week_num || getWeekNumber(date);
    const calculatedMonth = month || (date.getMonth() + 1);

    const query = `
      INSERT INTO working_day_calender (working_date, day, week_num, month)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `;
    const { rows } = await pool.query(query, [
      working_date,
      calculatedDay,
      calculatedWeekNum,
      calculatedMonth
    ]);

    res.json({
      message: "Working day added successfully",
      data: rows[0]
    });
  } catch (error) {
    console.error("❌ Error adding working day:", error);
    res.status(500).json({ error: error.message });
  }
};

// -----------------------------------------
// DELETE WORKING DAY
// -----------------------------------------
export const deleteWorkingDay = async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!id) {
      return res.status(400).json({ error: "Working day ID is required" });
    }

    const query = `
      DELETE FROM working_day_calender
      WHERE id = $1
      RETURNING *
    `;
    const { rows } = await pool.query(query, [id]);

    if (rows.length === 0) {
      return res.status(404).json({ error: "Working day not found" });
    }

    res.json({
      message: "Working day deleted successfully",
      data: rows[0]
    });
  } catch (error) {
    console.error("❌ Error deleting working day:", error);
    res.status(500).json({ error: error.message });
  }
};

// Helper function to get week number
function getWeekNumber(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}
