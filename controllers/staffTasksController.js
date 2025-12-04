import pool from "../config/db.js";

export const getStaffTasks = async (req, res) => {
  try {
    const {
      dashboardType = "checklist",
      staffFilter = "all",
      page = 1,
      limit = 50,
      monthYear = "" // Add this parameter
    } = req.query;

    const table = dashboardType;
    const offset = (page - 1) * limit;

    let completedCondition = "";

    if (table === "checklist") {
      completedCondition = "status = 'yes'";
    } else {
      completedCondition = "LOWER(status) = 'yes'";
    }

    // STEP 1 — Fetch unique names with month-year filter
    let staffQuery = `
      SELECT DISTINCT name 
      FROM ${table}
      WHERE name IS NOT NULL
      AND name != ''
      AND task_start_date IS NOT NULL
      AND task_start_date <= NOW()
    `;

    // Add month-year filter if provided
    if (monthYear) {
      const [year, month] = monthYear.split('-').map(Number);
      const startDate = `${year}-${month.toString().padStart(2, '0')}-01`;
      const endDate = new Date(year, month, 0).toISOString().split('T')[0]; // Last day of month
      
      staffQuery += ` AND task_start_date >= '${startDate}' AND task_start_date <= '${endDate} 23:59:59'`;
    }

    if (staffFilter !== "all") {
      staffQuery += ` AND LOWER(name) = LOWER('${staffFilter}')`;
    }

    staffQuery += ` ORDER BY name ASC`;

    const staffResult = await pool.query(staffQuery);
    const allStaff = staffResult.rows.map(r => r.name);

    const paginatedStaff = allStaff.slice(offset, offset + limit);

    if (paginatedStaff.length === 0) {
      return res.json([]);
    }

    const finalData = [];

    for (let staffName of paginatedStaff) {
      // Get task data with timing calculation
      let taskQuery = `
        SELECT 
          COUNT(*) AS total,
          SUM(
             CASE 
               WHEN submission_date IS NOT NULL 
                 OR (${completedCondition})
               THEN 1 
               ELSE 0 
             END
          ) AS completed,
          SUM(
            CASE 
              WHEN submission_date IS NOT NULL AND submission_date <= task_start_date
              THEN 1 
              WHEN submission_date IS NULL AND ${completedCondition} AND task_start_date <= NOW()
              THEN 1
              ELSE 0 
            END
          ) AS done_on_time,
          AVG(
            CASE 
              WHEN submission_date IS NOT NULL AND submission_date > task_start_date
              THEN EXTRACT(EPOCH FROM (submission_date - task_start_date)) / 86400.0 -- Delay in days
              ELSE 0
            END
          ) AS avg_delay_days
        FROM ${table}
        WHERE LOWER(name)=LOWER('${staffName}')
        AND task_start_date IS NOT NULL
      `;

      // Add month-year filter to task query if provided
      if (monthYear) {
        const [year, month] = monthYear.split('-').map(Number);
        const startDate = `${year}-${month.toString().padStart(2, '0')}-01`;
        const endDate = new Date(year, month, 0).toISOString().split('T')[0];
        
        taskQuery += ` AND task_start_date >= '${startDate}' AND task_start_date <= '${endDate} 23:59:59'`;
      } else {
        taskQuery += ` AND task_start_date <= NOW()`;
      }

      const taskResult = await pool.query(taskQuery);
      const total = Number(taskResult.rows[0].total);
      const completed = Number(taskResult.rows[0].completed);
      const doneOnTime = Number(taskResult.rows[0].done_on_time) || 0;
      const avgDelayDays = Number(taskResult.rows[0].avg_delay_days) || 0;
      const pending = total - completed;
      
      // Calculate on-time score as negative percentage
      let onTimeScore = 0;
      if (avgDelayDays > 0) {
        onTimeScore = -Math.min(100, Math.round(avgDelayDays * 100));
      } else if (completed > 0 && doneOnTime === completed) {
        onTimeScore = 100;
      }

      finalData.push({
        id: staffName.toLowerCase().replace(/\s+/g, "-"),
        name: staffName,
        email: `${staffName.toLowerCase().replace(/\s+/g, ".")}@example.com`,
        totalTasks: total,
        completedTasks: completed,
        pendingTasks: pending,
        doneOnTime: doneOnTime,
        onTimeScore: onTimeScore
      });
    }

    return res.json(finalData);

  } catch (err) {
    console.error("🔥 REAL ERROR →", err);
    res.status(500).json({ error: err.message });
  }
};



export const getStaffCount = async (req, res) => {
  try {
    const { dashboardType = "checklist", staffFilter = "all" } = req.query;
    const table = dashboardType;

    let query = `
      SELECT DISTINCT name 
      FROM ${table}
      WHERE name IS NOT NULL 
      AND name != ''
      AND task_start_date::timestamp <= NOW()
    `;

    if (staffFilter !== "all") {
      query += ` AND LOWER(name)=LOWER('${staffFilter}')`;
    }

    const result = await pool.query(query);
    const count = result.rows.length;

    return res.json(count);

  } catch (err) {
    console.error("Error in getStaffCount:", err);
    return res.status(500).json({ error: "Error fetching staff count" });
  }
};




export const getUsersCount = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT COUNT(*) FROM users
      WHERE user_name IS NOT NULL AND user_name != ''
    `);

    res.json(Number(result.rows[0].count));

  } catch (err) {
    console.error("Error in getUsersCount:", err);
    res.status(500).json({ error: "Error fetching total users count" });
  }
};
