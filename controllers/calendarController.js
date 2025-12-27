import pool from "../config/db.js";

// -----------------------------------------
// GET ALL TASKS FOR CALENDAR
// Fetches tasks from checklist and delegation tables
// Admin: sees all tasks | User: sees only their tasks
// -----------------------------------------
export const getCalendarTasks = async (req, res) => {
  try {
    const { month, year, username, role } = req.query;
    
    // Build date filter if month and year provided
    let dateFilter = "";
    if (month && year) {
      const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
      const endDate = new Date(year, month, 0).toISOString().split('T')[0]; // Last day of month
      dateFilter = ` AND task_start_date >= '${startDate}' AND task_start_date <= '${endDate} 23:59:59'`;
    }

    // Build name filter for non-admin users
    let nameFilter = "";
    if (role !== "admin" && username) {
      nameFilter = ` AND LOWER(name) = LOWER('${username}')`;
    }

    // Fetch checklist tasks
    const checklistQuery = `
      SELECT 
        task_id,
        department,
        given_by,
        name,
        task_description,
        frequency,
        status,
        task_start_date,
        submission_date,
        'checklist' as task_type
      FROM checklist
      WHERE task_start_date IS NOT NULL ${dateFilter} ${nameFilter}
      ORDER BY task_start_date ASC
    `;

    // Fetch delegation tasks
    const delegationQuery = `
      SELECT 
        task_id,
        department,
        given_by,
        name,
        task_description,
        frequency,
        status,
        task_start_date,
        submission_date,
        'delegation' as task_type
      FROM delegation
      WHERE task_start_date IS NOT NULL ${dateFilter} ${nameFilter}
      ORDER BY task_start_date ASC
    `;

    const [checklistResult, delegationResult] = await Promise.all([
      pool.query(checklistQuery),
      pool.query(delegationQuery)
    ]);

    res.json({
      checklist: checklistResult.rows,
      delegation: delegationResult.rows,
      totalChecklist: checklistResult.rows.length,
      totalDelegation: delegationResult.rows.length
    });

  } catch (error) {
    console.error("❌ Error fetching calendar tasks:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};
