import pool from "../config/db.js";

// Helper function to sanitize enum values (handle "NULL" strings, empty values, etc.)
const sanitizeEnumValue = (value, defaultValue = 'no') => {
  // Handle null, undefined, or falsy values
  if (!value) return defaultValue;
  
  // Convert to string safely
  const strValue = String(value).trim();
  
  // Handle empty string or "NULL" string (case-insensitive)
  if (strValue === '' || strValue.toUpperCase() === 'NULL') {
    return defaultValue;
  }
  
  // Return the value in lowercase for consistency
  return strValue.toLowerCase();
};

// Helper function to sanitize non-text fields (convert "NULL" strings to actual null)
const sanitizeNullValue = (value) => {
  // Handle null, undefined, or falsy values
  if (!value) return null;
  
  // Convert to string safely and check
  const strValue = String(value).trim();
  
  // Handle empty string or "NULL" string (case-insensitive)
  if (strValue === '' || strValue.toUpperCase() === 'NULL') {
    return null;
  }
  
  // Return the original value
  return value;
};

// Helper function to calculate next working dates based on frequency
const generateTaskDates = async (startDate, frequency, count = 365) => {
  // Get working days from calendar (excluding Sundays)
  const workingDaysResult = await pool.query(`
    SELECT working_date 
    FROM working_day_calender 
    WHERE working_date >= $1
    ORDER BY working_date ASC
    LIMIT $2
  `, [startDate, count]);

  const workingDays = workingDaysResult.rows.map(r => new Date(r.working_date));
  const taskDates = [];

  switch (frequency?.toLowerCase()) {
    case 'daily':
      // Every working day
      taskDates.push(...workingDays);
      break;

    case 'weekly':
      // Every 7th working day
      for (let i = 0; i < workingDays.length; i += 7) {
        taskDates.push(workingDays[i]);
      }
      break;

    case 'fortnightly':
      // Every 14th working day
      for (let i = 0; i < workingDays.length; i += 14) {
        taskDates.push(workingDays[i]);
      }
      break;

    case 'monthly':
      // First working day of each month
      let lastMonth = -1;
      for (const date of workingDays) {
        const month = date.getMonth();
        if (month !== lastMonth) {
          taskDates.push(date);
          lastMonth = month;
        }
      }
      break;

    case 'quarterly':
      // First working day of each quarter
      let lastQuarter = -1;
      for (const date of workingDays) {
        const quarter = Math.floor(date.getMonth() / 3);
        if (quarter !== lastQuarter) {
          taskDates.push(date);
          lastQuarter = quarter;
        }
      }
      break;

    case 'yearly':
      // First working day of each year
      let lastYear = -1;
      for (const date of workingDays) {
        const year = date.getFullYear();
        if (year !== lastYear) {
          taskDates.push(date);
          lastYear = year;
        }
      }
      break;

    default:
      // If no frequency or unknown, just use the start date
      taskDates.push(new Date(startDate));
  }

  return taskDates;
};

// Bulk import into checklist table (SMART IMPORT - generates recurring tasks)
export const bulkImportChecklist = async (req, res) => {
  try {
    const tasks = req.body;

    if (!Array.isArray(tasks) || tasks.length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: "Invalid data: Expected array of tasks" 
      });
    }

    // Validate required fields for checklist
    const requiredFields = ['name', 'task_description'];
    const errors = [];
    
    tasks.forEach((task, index) => {
      requiredFields.forEach(field => {
        if (!task[field]) {
          errors.push(`Row ${index + 1}: Missing required field '${field}'`);
        }
      });
    });

    if (errors.length > 0) {
      return res.status(400).json({ 
        success: false, 
        message: "Validation errors", 
        errors 
      });
    }

    console.log(`📥 Importing ${tasks.length} unique task definitions...`);

    // For each unique task definition, generate recurring task instances
    const allTaskInstances = [];
    
    for (const taskDef of tasks) {
      const startDate = taskDef.task_start_date || new Date().toISOString().split('T')[0];
      const frequency = taskDef.frequency || 'daily';
      
      // Generate task dates based on frequency and working calendar
      const taskDates = await generateTaskDates(startDate, frequency);
      
      console.log(`📅 Task "${taskDef.task_description}" (${frequency}): Generating ${taskDates.length} instances`);

      // Create task instance for each date
      for (const date of taskDates) {
        const taskInstance = {
          department: taskDef.department || null,
          given_by: taskDef.given_by || null,
          name: taskDef.name,
          task_description: taskDef.task_description,
          enable_reminder: sanitizeEnumValue(taskDef.enable_reminder, 'no'),
          require_attachment: sanitizeEnumValue(taskDef.require_attachment, 'no'),
          frequency: taskDef.frequency || null,
          remark: taskDef.remark || null,
          status: sanitizeEnumValue(taskDef.status, 'no'),
          image: taskDef.image || null,
          admin_done: taskDef.admin_done || null,
          delay: null,
          planned_date: sanitizeNullValue(taskDef.planned_date), // Use value from CSV
          task_start_date: date.toISOString(),
          submission_date: null
        };
        
        allTaskInstances.push(taskInstance);
      }
    }

    console.log(`✅ Total task instances to insert: ${allTaskInstances.length}`);

    // Build dynamic INSERT query for all instances
    const values = [];
    const params = [];
    let paramIndex = 1;

    allTaskInstances.forEach((task) => {
      const taskParams = [];
      const placeholders = [];

      const columns = {
        department: task.department,
        given_by: task.given_by,
        name: task.name,
        task_description: task.task_description,
        enable_reminder: task.enable_reminder,
        require_attachment: task.require_attachment,
        frequency: task.frequency,
        remark: task.remark,
        status: task.status,
        image: task.image,
        admin_done: task.admin_done,
        delay: task.delay,
        planned_date: task.planned_date,
        task_start_date: task.task_start_date,
        submission_date: task.submission_date
      };

      Object.values(columns).forEach(value => {
        placeholders.push(`$${paramIndex++}`);
        taskParams.push(value);
      });

      values.push(`(${placeholders.join(', ')})`);
      params.push(...taskParams);
    });

    const columnNames = [
      'department', 'given_by', 'name', 'task_description',
      'enable_reminder', 'require_attachment', 'frequency',
      'remark', 'status', 'image', 'admin_done', 'delay',
      'planned_date', 'task_start_date', 'submission_date'
    ];

    const query = `
      INSERT INTO checklist (${columnNames.join(', ')})
      VALUES ${values.join(', ')}
      RETURNING task_id, created_at
    `;

    const result = await pool.query(query, params);

    res.json({
      success: true,
      message: `Successfully generated ${result.rows.length} task instances from ${tasks.length} unique task definitions`,
      count: result.rows.length, // For frontend compatibility
      uniqueTasksCount: tasks.length,
      generatedTasksCount: result.rows.length,
      insertedIds: result.rows.map(r => r.task_id)
    });

  } catch (error) {
    console.error("Bulk import checklist error:", error);
    res.status(500).json({ 
      success: false, 
      message: "Failed to import tasks", 
      error: error.message 
    });
  }
};

// Bulk import into delegation table
export const bulkImportDelegation = async (req, res) => {
  try {
    const tasks = req.body;

    if (!Array.isArray(tasks) || tasks.length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: "Invalid data: Expected array of tasks" 
      });
    }

    // Validate required fields for delegation
    const requiredFields = ['name', 'task_description'];
    const errors = [];
    
    tasks.forEach((task, index) => {
      requiredFields.forEach(field => {
        if (!task[field]) {
          errors.push(`Row ${index + 1}: Missing required field '${field}'`);
        }
      });
    });

    if (errors.length > 0) {
      return res.status(400).json({ 
        success: false, 
        message: "Validation errors", 
        errors 
      });
    }

    // Build dynamic INSERT query
    const values = [];
    const params = [];
    let paramIndex = 1;

    tasks.forEach((task) => {
      const taskParams = [];
      const placeholders = [];

      // Define column mapping (skip task_id and created_at as they're auto-generated)
      const columns = {
        department: task.department || null,
        given_by: task.given_by || null,
        name: task.name,
        task_description: task.task_description,
        // Handle string "NULL", empty strings, and null values for enum fields
        enable_reminder: sanitizeEnumValue(task.enable_reminder, 'no'),
        require_attachment: sanitizeEnumValue(task.require_attachment, 'no'),
        frequency: task.frequency || null,
        remark: task.remark || null,
        status: sanitizeEnumValue(task.status, 'no'),
        image: task.image || null,
        admin_done: task.admin_done || null,
        delay: sanitizeNullValue(task.delay),
        planned_date: sanitizeNullValue(task.planned_date),
        task_start_date: sanitizeNullValue(task.task_start_date),
        submission_date: sanitizeNullValue(task.submission_date)
      };

      Object.values(columns).forEach(value => {
        placeholders.push(`$${paramIndex++}`);
        taskParams.push(value);
      });

      values.push(`(${placeholders.join(', ')})`);
      params.push(...taskParams);
    });

    const columnNames = [
      'department', 'given_by', 'name', 'task_description',
      'enable_reminder', 'require_attachment', 'frequency',
      'remark', 'status', 'image', 'admin_done', 'delay',
      'planned_date', 'task_start_date', 'submission_date'
    ];

    const query = `
      INSERT INTO delegation (${columnNames.join(', ')})
      VALUES ${values.join(', ')}
      RETURNING task_id, created_at
    `;

    const result = await pool.query(query, params);

    res.json({
      success: true,
      message: `Successfully imported ${result.rows.length} tasks`,
      count: result.rows.length,
      insertedIds: result.rows.map(r => r.task_id)
    });

  } catch (error) {
    console.error("Bulk import delegation error:", error);
    res.status(500).json({ 
      success: false, 
      message: "Failed to import tasks", 
      error: error.message 
    });
  }
};
