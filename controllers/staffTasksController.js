import pool from "../config/db.js";

export const getStaffTasks = async (req, res) => {
  try {
    const {
      dashboardType = "checklist",
      staffFilter = "all",
      page = 1,
      limit = 50,
      monthYear = "",
      tillDate = "",
      role = "",
      username = "",
      unit = "",
      division = "",
      department = ""
    } = req.query;

    const table = dashboardType;
    const offset = (page - 1) * limit;

    let completedCondition = "";

    if (table === "checklist") {
      completedCondition = "status = 'yes'";
    } else {
      completedCondition = "LOWER(status) = 'yes'";
    }

    const params = [];
    let paramCount = 1;

    let staffQuery = "";
    const userRole = (role || "").toUpperCase();

    if (userRole === "SUPER_ADMIN" || !userRole) {
      staffQuery = `
        SELECT DISTINCT t.name, u.department, u.division
        FROM ${table} t
        LEFT JOIN users u ON LOWER(t.name) = LOWER(u.user_name)
        WHERE t.name IS NOT NULL
        AND t.name != ''
        AND t.task_start_date IS NOT NULL
        AND t.task_start_date <= NOW()
      `;
    } else {
      staffQuery = `
        SELECT DISTINCT t.name, u.department, u.division
        FROM ${table} t
        JOIN users u ON LOWER(t.name) = LOWER(u.user_name)
        WHERE t.name IS NOT NULL
        AND t.name != ''
        AND t.task_start_date IS NOT NULL
        AND t.task_start_date <= NOW()
      `;

      if (userRole === "DIV_ADMIN" && unit && division) {
        staffQuery += ` AND LOWER(u.unit) = LOWER($${paramCount}) AND LOWER(u.division) = LOWER($${paramCount + 1})`;
        params.push(unit, division);
        paramCount += 2;
      } else if (userRole === "ADMIN" && unit && division && department) {
        staffQuery += ` AND LOWER(u.unit) = LOWER($${paramCount}) AND LOWER(u.division) = LOWER($${paramCount + 1}) AND LOWER(u.department) = LOWER($${paramCount + 2})`;
        params.push(unit, division, department);
        paramCount += 3;
      } else if (userRole === "USER" && username) {
        staffQuery += ` AND LOWER(t.name) = LOWER($${paramCount})`;
        params.push(username);
        paramCount++;
      }
    }

    // Add month-year filter if provided
    if (monthYear) {
      const [year, month] = monthYear.split('-').map(Number);
      const startDate = `${year}-${month.toString().padStart(2, '0')}-01`;
      const endDate = new Date(year, month, 0).toISOString().split('T')[0];

      staffQuery += ` AND t.task_start_date >= $${paramCount} AND t.task_start_date <= $${paramCount + 1}`;
      params.push(startDate, `${endDate} 23:59:59`);
      paramCount += 2;
    }

    // Add till-date filter if provided (independent of month filter)
    if (tillDate) {
      staffQuery += ` AND t.task_start_date <= $${paramCount}`;
      params.push(`${tillDate} 23:59:59`);
      paramCount++;
    }

    if (staffFilter !== "all") {
      staffQuery += ` AND LOWER(t.name) = LOWER($${paramCount})`;
      params.push(staffFilter);
    }

    if (userRole === "SUPER_ADMIN") {
      staffQuery += ` ORDER BY u.division ASC, u.department ASC, t.name ASC`;
    } else {
      staffQuery += ` ORDER BY t.name ASC`;
    }

    const staffResult = await pool.query(staffQuery, params);
    const allStaff = staffResult.rows.map(r => r.name || r.t_name); // Should be name

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
      `;
      const tp = [];
      let tc = 1;

      taskQuery += ` WHERE LOWER(name)=LOWER($${tc})`;
      tp.push(staffName);
      tc++;

      // Add month-year filter to task query if provided
      if (monthYear) {
        const [year, month] = monthYear.split('-').map(Number);
        const startDate = `${year}-${month.toString().padStart(2, '0')}-01`;
        const endDate = new Date(year, month, 0).toISOString().split('T')[0];

        taskQuery += ` AND task_start_date >= $${tc} AND task_start_date <= $${tc + 1}`;
        tp.push(startDate, `${endDate} 23:59:59`);
        tc += 2;
      } else {
        taskQuery += ` AND task_start_date <= NOW()`;
      }

      // Add till-date filter to task query if provided
      if (tillDate) {
        taskQuery += ` AND task_start_date <= $${tc}`;
        tp.push(`${tillDate} 23:59:59`);
        tc++;
      }

      taskQuery += ` AND task_start_date IS NOT NULL`;

      const taskResult = await pool.query(taskQuery, tp);

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
    const {
      dashboardType = "checklist",
      staffFilter = "all",
      role = "",
      unit = "",
      division = "",
      department = ""
    } = req.query;
    const table = dashboardType;

    const paramsCount = [];
    let pc = 1;

    let query = "";
    const userRole = (role || "").toUpperCase();

    if (userRole === "SUPER_ADMIN" || !userRole) {
      query = `
        SELECT DISTINCT t.name 
        FROM ${table} t
        LEFT JOIN users u ON LOWER(t.name) = LOWER(u.user_name)
        WHERE t.name IS NOT NULL 
        AND t.name != ''
        AND t.task_start_date::timestamp <= NOW()
      `;
    } else {
      query = `
        SELECT DISTINCT t.name 
        FROM ${table} t
        JOIN users u ON LOWER(t.name) = LOWER(u.user_name)
        WHERE t.name IS NOT NULL 
        AND t.name != ''
        AND t.task_start_date::timestamp <= NOW()
      `;

      if (userRole === "DIV_ADMIN" && unit && division) {
        query += ` AND LOWER(u.unit) = LOWER($${pc}) AND LOWER(u.division) = LOWER($${pc + 1})`;
        paramsCount.push(unit, division);
        pc += 2;
      } else if (userRole === "ADMIN" && unit && division && department) {
        query += ` AND LOWER(u.unit) = LOWER($${pc}) AND LOWER(u.division) = LOWER($${pc + 1}) AND LOWER(u.department) = LOWER($${pc + 2})`;
        paramsCount.push(unit, division, department);
        pc += 3;
      } else if (userRole === "USER" && username) {
        query += ` AND LOWER(t.name) = LOWER($${pc})`;
        paramsCount.push(username);
        pc++;
      }
    }

    if (staffFilter !== "all") {
      query += ` AND LOWER(${$pc === 1 ? 'name' : 't.name'})=LOWER($${pc})`;
      paramsCount.push(staffFilter);
    }

    const result = await pool.query(query, paramsCount);
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
