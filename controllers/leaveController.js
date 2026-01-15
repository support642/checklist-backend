import pool from "../config/db.js";

// Transfer tasks from user on leave to delegated doer
const transferTasks = async (req, res) => {
  const { username, delegateTo, startDate, endDate } = req.body;

  if (!username || !delegateTo || !startDate || !endDate) {
    return res.status(400).json({
      success: false,
      message: "Missing required fields: username, delegateTo, startDate, endDate"
    });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Format dates for PostgreSQL
    const formattedStartDate = `${startDate}T00:00:00`;
    const formattedEndDate = `${endDate}T23:59:59`;

    // 1. Fetch checklist tasks in the date range
    const fetchQuery = `
      SELECT * FROM checklist
      WHERE name = $1
      AND task_start_date >= $2
      AND task_start_date <= $3
    `;
    const fetchResult = await client.query(fetchQuery, [username, formattedStartDate, formattedEndDate]);
    const tasksToTransfer = fetchResult.rows;

    if (tasksToTransfer.length === 0) {
      await client.query('ROLLBACK');
      return res.status(200).json({
        success: true,
        tasksTransferred: 0,
        message: "No tasks found in the specified date range"
      });
    }

    // 2. Insert tasks into delegation table
    const insertPromises = tasksToTransfer.map(task => {
      const insertQuery = `
        INSERT INTO delegation (
          task_id, task_description, given_by, name, 
          created_at, status, department, frequency,
          task_start_date, planned_date
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      `;
      return client.query(insertQuery, [
        task.task_id,
        task.task_description,
        task.name, // The original doer (user on leave)
        delegateTo, // The new doer
        task.task_start_date, // Use task start date as created_at
        'pending',
        task.department || '',
        task.frequency || '',
        task.task_start_date, // Required: task_start_date
        task.planned_date // Required: planned_date
      ]);
    });

    await Promise.all(insertPromises);

    // 3. Delete original checklist tasks
    const deleteQuery = `
      DELETE FROM checklist
      WHERE name = $1
      AND task_start_date >= $2
      AND task_start_date <= $3
    `;
    await client.query(deleteQuery, [username, formattedStartDate, formattedEndDate]);

    await client.query('COMMIT');

    res.status(200).json({
      success: true,
      tasksTransferred: tasksToTransfer.length,
      message: `Successfully transferred ${tasksToTransfer.length} tasks from ${username} to ${delegateTo}`
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error("Error transferring tasks:", error);
    res.status(500).json({
      success: false,
      message: "Error transferring tasks",
      error: error.message
    });
  } finally {
    client.release();
  }
};

// Fetch user tasks by date range
const getUserTasks = async (req, res) => {
  const { username, startDate, endDate } = req.query;

  if (!username || !startDate || !endDate) {
    return res.status(400).json({
      success: false,
      message: "Missing required parameters: username, startDate, endDate"
    });
  }

  try {
    // Format dates for PostgreSQL
    const formattedStartDate = `${startDate}T00:00:00`;
    const formattedEndDate = `${endDate}T23:59:59`;

    // Fetch checklist tasks in the date range
    const fetchQuery = `
      SELECT 
        task_id, 
        name, 
        task_description, 
        task_start_date, 
        department, 
        given_by, 
        frequency,
        planned_date
      FROM checklist
      WHERE name = $1
      AND task_start_date >= $2
      AND task_start_date <= $3
      ORDER BY task_start_date ASC
    `;
    
    const result = await pool.query(fetchQuery, [username, formattedStartDate, formattedEndDate]);

    res.status(200).json({
      success: true,
      tasks: result.rows,
      count: result.rows.length
    });

  } catch (error) {
    console.error("Error fetching user tasks:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching user tasks",
      error: error.message
    });
  }
};

// Assign individual tasks to different users
const assignIndividualTasks = async (req, res) => {
  const { assignments } = req.body;

  if (!assignments || !Array.isArray(assignments) || assignments.length === 0) {
    return res.status(400).json({
      success: false,
      message: "Missing or invalid assignments array"
    });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Insert each task into delegation table with individual doer
    const insertPromises = assignments.map(task => {
      const insertQuery = `
        INSERT INTO delegation (
          task_id, task_description, given_by, name, 
          created_at, status, department, frequency,
          task_start_date, planned_date
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      `;
      return client.query(insertQuery, [
        task.task_id,
        task.task_description,
        task.username, // The original doer (user on leave)
        task.delegateTo, // The new doer assigned to this specific task
        task.task_start_date, // Use task start date as created_at
        'pending',
        task.department || '',
        task.frequency || '',
        task.task_start_date,
        task.planned_date
      ]);
    });

    await Promise.all(insertPromises);

    // Delete original checklist tasks using task_ids
    const taskIds = assignments.map(t => t.task_id);
    const deleteQuery = `
      DELETE FROM checklist
      WHERE task_id = ANY($1)
    `;
    await client.query(deleteQuery, [taskIds]);

    await client.query('COMMIT');

    res.status(200).json({
      success: true,
      tasksTransferred: assignments.length,
      message: `Successfully transferred ${assignments.length} tasks with individual assignments`
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error("Error assigning individual tasks:", error);
    res.status(500).json({
      success: false,
      message: "Error assigning individual tasks",
      error: error.message
    });
  } finally {
    client.release();
  }
};

export { transferTasks, getUserTasks, assignIndividualTasks };
