import pool from "../config/db.js";

const today = new Date().toISOString().split("T")[0];

// Helper function to get current month range
const getCurrentMonthRange = () => {
  const currentDate = new Date();
  const firstDayOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
  const firstDayStr = firstDayOfMonth.toISOString().split('T')[0];
  const currentDayStr = currentDate.toISOString().split('T')[0];
  return { firstDayStr, currentDayStr };
};

export const getDashboardData = async (req, res) => {
  try {
    const {
      dashboardType,
      staffFilter,
      page = 1,
      limit = 50,
      departmentFilter,
      role,
      username,
      taskView = "recent"
    } = req.query;

    const table = dashboardType;
    const offset = (page - 1) * limit;
    
    // Get current month range
    const { firstDayStr, currentDayStr } = getCurrentMonthRange();

    let query = `SELECT * FROM ${table} WHERE 1=1`;

    // ---------------------------
    // ROLE FILTER (USER)
    // ---------------------------
    if (role === "user" && username) {
      query += ` AND LOWER(name) = LOWER('${username}')`;
    }

    // ---------------------------
    // ADMIN STAFF FILTER
    // ---------------------------
    if (role === "admin" && staffFilter !== "all") {
      query += ` AND LOWER(name) = LOWER('${staffFilter}')`;
    }

    // ---------------------------
    // DEPARTMENT FILTER
    // ---------------------------
    if (dashboardType === "checklist" && departmentFilter !== "all") {
      query += ` AND LOWER(department) = LOWER('${departmentFilter}')`;
    }

    // ---------------------------
    // IMPORTANT FIX: For "all" taskView, show ALL tasks in current month
    // For specific views, show tasks within current month for that view
    // ---------------------------
    if (taskView === "all") {
      // For "all" view: Show all tasks from 1st of month to current date
      query += `
        AND task_start_date >= '${firstDayStr} 00:00:00'
        AND task_start_date <= '${currentDayStr} 23:59:59'
      `;
    } else {
      // For specific views: Apply both current month AND specific date filters
      query += `
        AND task_start_date >= '${firstDayStr} 00:00:00'
        AND task_start_date <= '${currentDayStr} 23:59:59'
      `;
    }

    // ---------------------------
    // TASK VIEW FILTERS (for specific views within current month)
    // ---------------------------
    if (taskView === "recent") {
      // TODAY TASKS within current month
      query += `
        AND task_start_date >= CURRENT_DATE
        AND task_start_date < CURRENT_DATE + INTERVAL '1 day'
      `;

      if (dashboardType === "checklist") {
        query += ` AND (status IS NULL OR status <> 'yes')`;
      }
    }
    else if (taskView === "upcoming") {
      // TOMORROW TASKS within current month
      query += `
        AND task_start_date >= CURRENT_DATE + INTERVAL '1 day'
        AND task_start_date < CURRENT_DATE + INTERVAL '2 day'
      `;
    }
    else if (taskView === "overdue") {
      // PAST DUE + NOT COMPLETED within current month
      query += `
        AND task_start_date < CURRENT_DATE
      `;

      if (dashboardType === "checklist") {
        query += ` AND (status IS NULL OR status <> 'yes')`;
      } else {
        query += ` AND submission_date IS NULL`;
      }
    }

    // ORDER + PAGINATION
    query += ` ORDER BY task_start_date DESC LIMIT ${limit} OFFSET ${offset}`;

    console.log("FINAL QUERY =>", query);

    const result = await pool.query(query);
    res.json(result.rows);

  } catch (err) {
    console.error("ERROR in getDashboardData:", err);
    res.status(500).send("Error fetching dashboard data");
  }
};

export const getTotalTask = async (req, res) => {
  try {
    const { dashboardType, staffFilter, departmentFilter, role, username } = req.query;

    const table = dashboardType;
    
    // Get current month range
    const { firstDayStr, currentDayStr } = getCurrentMonthRange();

    let query = `
      SELECT COUNT(*) AS count
      FROM ${table}
      WHERE task_start_date >= '${firstDayStr} 00:00:00'
      AND task_start_date <= '${currentDayStr} 23:59:59'
    `;

    // ROLE FILTER
    if (role === "user" && username) {
      query += ` AND LOWER(name)=LOWER('${username}')`;
    }

    // STAFF FILTER (admin only)
    if (role === "admin" && staffFilter !== "all") {
      query += ` AND LOWER(name)=LOWER('${staffFilter}')`;
    }

    // DEPARTMENT FILTER (checklist only)
    if (dashboardType === "checklist" && departmentFilter !== "all") {
      query += ` AND LOWER(department)=LOWER('${departmentFilter}')`;
    }

    const result = await pool.query(query);
    res.json(Number(result.rows[0].count));
  } catch (err) {
    console.error("TOTAL ERROR:", err.message);
    res.status(500).json({ error: "Error fetching total tasks" });
  }
};

export const getCompletedTask = async (req, res) => {
  try {
    const { dashboardType, staffFilter, departmentFilter, role, username } = req.query;

    const table = dashboardType;
    
    // Get current month range
    const { firstDayStr, currentDayStr } = getCurrentMonthRange();

    let query = `
      SELECT COUNT(*) AS count
      FROM ${table}
      WHERE task_start_date >= '${firstDayStr} 00:00:00'
      AND task_start_date <= '${currentDayStr} 23:59:59'
    `;

    if (dashboardType === "checklist") {
      query += ` AND status = 'yes' `;
    } else {
      query += ` AND submission_date IS NOT NULL `;
    }

    if (role === "user" && username) query += ` AND LOWER(name)=LOWER('${username}')`;
    if (role === "admin" && staffFilter !== "all") query += ` AND LOWER(name)=LOWER('${staffFilter}')`;
    if (dashboardType === "checklist" && departmentFilter !== "all")
      query += ` AND LOWER(department)=LOWER('${departmentFilter}')`;

    const result = await pool.query(query);
    res.json(Number(result.rows[0].count));
  } catch (err) {
    console.error("COMPLETED ERROR:", err.message);
    res.status(500).json({ error: "Error fetching completed tasks" });
  }
};

export const getPendingTask = async (req, res) => {
  try {
    const { dashboardType, staffFilter, departmentFilter, role, username } = req.query;

    const table = dashboardType;
    
    // Get current month range
    const { firstDayStr, currentDayStr } = getCurrentMonthRange();

    let query = `
      SELECT COUNT(*) AS count
      FROM ${table}
      WHERE task_start_date >= '${firstDayStr} 00:00:00'
      AND task_start_date <= '${currentDayStr} 23:59:59'
      AND submission_date IS NULL
    `;

    if (dashboardType === "checklist") {
      query += ` AND (status IS NULL OR status <> 'yes') `;
    }

    if (role === "user" && username) query += ` AND LOWER(name)=LOWER('${username}')`;
    if (role === "admin" && staffFilter !== "all") query += ` AND LOWER(name)=LOWER('${staffFilter}')`;
    if (dashboardType === "checklist" && departmentFilter !== "all")
      query += ` AND LOWER(department)=LOWER('${departmentFilter}')`;

    const result = await pool.query(query);
    res.json(Number(result.rows[0].count));
  } catch (err) {
    console.error("PENDING ERROR:", err.message);
    res.status(500).json({ error: "Error fetching pending tasks" });
  }
};

export const getNotDoneTask = async (req, res) => {
  try {
    const { dashboardType, staffFilter, departmentFilter, role, username } = req.query;
    const table = dashboardType;
    
    // Get current month range
    const { firstDayStr, currentDayStr } = getCurrentMonthRange();

    let query = `
      SELECT COUNT(*) AS count
      FROM ${table}
      WHERE task_start_date >= '${firstDayStr} 00:00:00'
      AND task_start_date <= '${currentDayStr} 23:59:59'
      AND status = 'no'
      AND submission_date IS NOT NULL
    `;

    if (role === "user" && username) {
      query += ` AND name = '${username}'`;
    }

    if (role === "admin" && staffFilter !== "all") {
      query += ` AND name = '${staffFilter}'`;
    }

    if (dashboardType === "checklist" && departmentFilter !== "all") {
      query += ` AND department = '${departmentFilter}'`;
    }

    const result = await pool.query(query);
    res.json(Number(result.rows[0].count || 0));

  } catch (err) {
    console.error("❌ NOT DONE ERROR:", err.message);
    res.status(500).json({ error: "Error fetching not done tasks" });
  }
};

export const getOverdueTask = async (req, res) => {
  try {
    const { dashboardType, staffFilter, departmentFilter, role, username } = req.query;

    const table = dashboardType;
    
    // Get current month range
    const { firstDayStr, currentDayStr } = getCurrentMonthRange();

    let query = `
      SELECT COUNT(*) AS count
      FROM ${table}
      WHERE task_start_date >= '${firstDayStr} 00:00:00'
      AND task_start_date <= '${currentDayStr} 23:59:59'
      AND task_start_date < NOW()
      AND submission_date IS NULL
    `;

    if (dashboardType === "checklist") {
      query += ` AND (status IS NULL OR status <> 'yes') `;
    }

    if (role === "user" && username) query += ` AND LOWER(name)=LOWER('${username}')`;
    if (role === "admin" && staffFilter !== "all") query += ` AND LOWER(name)=LOWER('${staffFilter}')`;
    if (dashboardType === "checklist" && departmentFilter !== "all")
      query += ` AND LOWER(department)=LOWER('${departmentFilter}')`;

    const result = await pool.query(query);
    res.json(Number(result.rows[0].count));
  } catch (err) {
    console.error("OVERDUE ERROR:", err.message);
    res.status(500).json({ error: "Error fetching overdue tasks" });
  }
};

export const getUniqueDepartments = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT DISTINCT department FROM users 
      WHERE department IS NOT NULL AND department!=''
    `);

    res.json(result.rows.map(d => d.department));
  } catch (err) {
    console.error("DEPARTMENTS ERROR:", err.message);
    res.status(500).json({ error: "Error fetching departments" });
  }
};

export const getStaffByDepartment = async (req, res) => {
  try {
    const { department } = req.query;

    let query = `SELECT user_name, user_access FROM users`;

    const result = await pool.query(query);

    let staff = result.rows;

    if (department && department !== "all") {
      staff = staff.filter(u =>
        u.user_access &&
        u.user_access.toLowerCase().includes(department.toLowerCase())
      );
    }

    res.json(staff.map(s => s.user_name));
  } catch (err) {
    console.error("STAFF BY DEPARTMENT ERROR:", err.message);
    res.status(500).json({ error: "Error fetching staff by department" });
  }
};

export const getChecklistByDateRange = async (req, res) => {
  try {
    const { startDate, endDate, staffFilter, departmentFilter } = req.query;

    // If no specific date range is provided, default to current month
    let start = startDate;
    let end = endDate;
    
    if (!startDate || !endDate) {
      const { firstDayStr, currentDayStr } = getCurrentMonthRange();
      start = firstDayStr;
      end = currentDayStr;
    }

    let query = `
      SELECT * FROM checklist
      WHERE task_start_date BETWEEN '${start} 00:00:00'
      AND '${end} 23:59:59'
    `;

    if (staffFilter !== "all") {
      query += ` AND LOWER(name)=LOWER('${staffFilter}')`;
    }

    if (departmentFilter !== "all") {
      query += ` AND LOWER(department)=LOWER('${departmentFilter}')`;
    }

    const result = await pool.query(query);
    res.json(result.rows);
  } catch (err) {
    console.error("CHECKLIST DATE RANGE ERROR:", err.message);
    res.status(500).json({ error: "Error fetching checklist by date range" });
  }
};

export const getChecklistStatsByDate = async (req, res) => {
  try {
    const { startDate, endDate, staffFilter, departmentFilter } = req.query;

    // If no date range provided, default to current month
    let start = startDate;
    let end = endDate;
    
    if (!startDate || !endDate) {
      const { firstDayStr, currentDayStr } = getCurrentMonthRange();
      start = firstDayStr;
      end = currentDayStr;
    }

    let query = `
      SELECT * FROM checklist
      WHERE task_start_date BETWEEN '${start} 00:00:00'
      AND '${end} 23:59:59'
    `;

    if (staffFilter !== "all") query += ` AND LOWER(name)=LOWER('${staffFilter}')`;
    if (departmentFilter !== "all") query += ` AND LOWER(department)=LOWER('${departmentFilter}')`;

    const result = await pool.query(query);
    const data = result.rows;

    const totalTasks = data.length;
    const completedTasks = data.filter(t => t.status === "Yes").length;
    const overdueTasks = data.filter(t =>
      (!t.status || t.status !== "Yes") &&
      new Date(t.task_start_date) < new Date(today)
    ).length;
    const pendingTasks = totalTasks - completedTasks;

    res.json({
      totalTasks,
      completedTasks,
      pendingTasks,
      overdueTasks,
      completionRate: totalTasks > 0 ? (completedTasks / totalTasks * 100).toFixed(1) : 0
    });
  } catch (err) {
    console.error("CHECKLIST STATS ERROR:", err.message);
    res.status(500).json({ error: "Error fetching checklist stats" });
  }
};

export const getStaffTaskSummary = async (req, res) => {
  try {
    const { dashboardType } = req.query;
    const table = dashboardType;
    
    // Get current month range
    const { firstDayStr, currentDayStr } = getCurrentMonthRange();

    const query = `
      SELECT name,
        COUNT(*) AS total,
        SUM(
          CASE 
            WHEN submission_date IS NOT NULL THEN 1
            WHEN status = 'Yes' THEN 1
            ELSE 0 
          END
        ) AS completed
      FROM ${table}
      WHERE task_start_date >= '${firstDayStr} 00:00:00'
      AND task_start_date <= '${currentDayStr} 23:59:59'
      GROUP BY name
      ORDER BY name ASC
    `;

    const result = await pool.query(query);

    const formatted = result.rows.map(r => ({
      id: r.name?.toLowerCase().replace(/\s+/g, "-"),
      name: r.name,
      email: `${r.name?.toLowerCase().replace(/\s+/g, ".")}@example.com`,
      totalTasks: Number(r.total),
      completedTasks: Number(r.completed),
      pendingTasks: Number(r.total) - Number(r.completed),
      progress: Math.round((Number(r.completed) / Number(r.total)) * 100)
    }));

    res.json(formatted);
    
  } catch (err) {
    console.error("STAFF SUMMARY ERROR:", err.message);
    res.status(500).json({ error: "Error fetching staff task summary" });
  }
};

export const getDashboardDataCount = async (req, res) => {
  try {
    const { 
      dashboardType, 
      staffFilter = "all", 
      taskView = "recent", 
      departmentFilter = "all" 
    } = req.query;

    const role = req.query.role;
    const username = req.query.username;
    
    // Get current month range
    const { firstDayStr, currentDayStr } = getCurrentMonthRange();

    // Base query with current month filter
    let query = `
      SELECT COUNT(*) AS count
      FROM ${dashboardType}
      WHERE task_start_date >= '${firstDayStr} 00:00:00'
      AND task_start_date <= '${currentDayStr} 23:59:59'
    `;

    // ROLE FILTER (USER)
    if (role === "user" && username) {
      query += ` AND LOWER(name) = LOWER('${username}')`;
    }

    // ADMIN STAFF FILTER
    if (role === "admin" && staffFilter !== "all") {
      query += ` AND LOWER(name) = LOWER('${staffFilter}')`;
    }

    // DEPARTMENT FILTER (checklist only)
    if (dashboardType === "checklist" && departmentFilter !== "all") {
      query += ` AND LOWER(department) = LOWER('${departmentFilter}')`;
    }

    // TASK VIEW LOGIC
    if (taskView === "recent") {
      query += `
        AND task_start_date >= CURRENT_DATE
        AND task_start_date < CURRENT_DATE + INTERVAL '1 day'
      `;

      if (dashboardType === "checklist") {
        query += ` AND (status IS NULL OR status <> 'yes')`;
      }
    } 
    else if (taskView === "upcoming") {
      query += `
        AND task_start_date >= CURRENT_DATE + INTERVAL '1 day'
        AND task_start_date < CURRENT_DATE + INTERVAL '2 day'
      `;
    }
    else if (taskView === "overdue") {
      query += `
        AND task_start_date < CURRENT_DATE
        AND submission_date IS NULL
      `;

      if (dashboardType === "checklist") {
        query += ` AND (status IS NULL OR status <> 'yes')`;
      }
    }

    const result = await pool.query(query);
    const count = Number(result.rows[0].count || 0);
    
    res.json(count);

  } catch (err) {
    console.error("DASHBOARD COUNT ERROR:", err.message);
    res.status(500).json({ error: "Error fetching dashboard count" });
  }
};

export const getChecklistDateRangeCount = async (req, res) => {
  try {
    const { 
      startDate, 
      endDate, 
      staffFilter = "all", 
      departmentFilter = "all", 
      statusFilter = "all" 
    } = req.query;

    const role = req.query.role;
    const username = req.query.username;

    // If no date range provided, default to current month
    let start = startDate;
    let end = endDate;
    
    if (!startDate || !endDate) {
      const { firstDayStr, currentDayStr } = getCurrentMonthRange();
      start = firstDayStr;
      end = currentDayStr;
    }

    let query = `
      SELECT COUNT(*) AS count
      FROM checklist
      WHERE task_start_date >= '${start} 00:00:00'
      AND task_start_date <= '${end} 23:59:59'
    `;

    // ROLE FILTER (USER)
    if (role === "user" && username) {
      query += ` AND LOWER(name) = LOWER('${username}')`;
    }

    // ADMIN STAFF FILTER
    if (role === "admin" && staffFilter !== "all") {
      query += ` AND LOWER(name) = LOWER('${staffFilter}')`;
    }

    // DEPARTMENT FILTER
    if (departmentFilter !== "all") {
      query += ` AND LOWER(department) = LOWER('${departmentFilter}')`;
    }

    // STATUS FILTER
    switch (statusFilter) {
      case "completed":
        query += ` AND status = 'Yes'`;
        break;
      case "pending":
        query += ` AND (status IS NULL OR status <> 'Yes')`;
        break;
      case "overdue":
        query += ` 
          AND (status IS NULL OR status <> 'Yes')
          AND submission_date IS NULL
          AND task_start_date < CURRENT_DATE
        `;
        break;
    }

    const result = await pool.query(query);
    const count = Number(result.rows[0].count || 0);
    
    res.json(count);

  } catch (err) {
    console.error("DATE RANGE COUNT ERROR:", err.message);
    res.status(500).json({ error: "Error fetching date range count" });
  }
};

