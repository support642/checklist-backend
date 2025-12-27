import pool from "../config/db.js";

// ------------------------ FETCH CHECKLIST ------------------------
export const fetchChecklist = async (
  page = 0,
  pageSize = 50,
  nameFilter = ""
) => {
  try {
    const offset = page * pageSize;
    const params = [];
    let paramIndex = 1;

    let whereClause = "submission_date IS NULL";

    if (nameFilter) {
      whereClause += ` AND LOWER(name) = LOWER($${paramIndex++})`;
      params.push(nameFilter);
    }

    // ⭐ DISTINCT ON ensures uniqueness based on (name + task_description)
    const dataQuery = `
      SELECT DISTINCT ON (LOWER(name), LOWER(task_description))
        *
      FROM checklist
      WHERE ${whereClause}
      ORDER BY LOWER(name), LOWER(task_description), task_start_date ASC
      LIMIT $${paramIndex++}
      OFFSET $${paramIndex}
    `;

    const dataParams = [...params, pageSize, offset];

    // Count unique rows
    const countQuery = `
      SELECT COUNT(*) FROM (
        SELECT DISTINCT ON (LOWER(name), LOWER(task_description))
          name, task_description
        FROM checklist
        WHERE ${whereClause}
      ) AS unique_tasks
    `;

    const [dataRes, countRes] = await Promise.all([
      pool.query(dataQuery, dataParams),
      pool.query(countQuery, params),
    ]);

    const total = parseInt(countRes.rows[0]?.count ?? 0, 10);

    return { data: dataRes.rows, total };

  } catch (err) {
    console.log(err);
    return { data: [], total: 0 };
  }
};



export const fetchDelegation = async (
  page = 0,
  pageSize = 50,
  nameFilter = "",
  startDate,
  endDate
) => {
  try {
    const offset = page * pageSize;
    const filters = ["submission_date IS NULL"];
    const params = [];
    let paramIndex = 1;

    const hasDateRange = startDate && endDate;
    if (hasDateRange) {
      filters.push(`task_start_date >= $${paramIndex++}`);
      params.push(`${startDate} 00:00:00`);
      filters.push(`task_start_date <= $${paramIndex++}`);
      params.push(`${endDate} 23:59:59`);
    } else {
      // Default to today's tasks when no explicit range is provided
      filters.push("task_start_date::date = CURRENT_DATE");
    }

    if (nameFilter) {
      filters.push(`LOWER(name) = LOWER($${paramIndex++})`);
      params.push(nameFilter);
    }

    const whereClause = filters.join(" AND ");

    const dataQuery = `
      SELECT *
      FROM delegation
      WHERE ${whereClause}
      ORDER BY task_start_date ASC
      LIMIT $${paramIndex++}
      OFFSET $${paramIndex}
    `;

    const dataParams = [...params, pageSize, offset];

    const countQuery = `
      SELECT COUNT(*) AS count
      FROM delegation
      WHERE ${whereClause}
    `;

    const [dataRes, countRes] = await Promise.all([
      pool.query(dataQuery, dataParams),
      pool.query(countQuery, params),
    ]);

    const total = parseInt(countRes.rows[0]?.count ?? 0, 10);
    return { data: dataRes.rows, total };
  } catch (err) {
    console.log(err);
    return { data: [], total: 0 };
  }
};


export const deleteChecklistTasks = async (tasks) => {
  for (const t of tasks) {
    await pool.query(
      `
      DELETE FROM checklist
      WHERE name = $1
      AND task_description = $2
      AND submission_date IS NULL
      `,
      [t.name, t.task_description]
    );
  }

  return tasks;
};


export const deleteDelegationTasks = async (taskIds) => {
  await pool.query(
    `
    DELETE FROM delegation
    WHERE task_id = ANY($1)
    AND submission_date IS NULL
    `,
    [taskIds]
  );

  return taskIds;
};


export const updateChecklistTask = async (updatedTask, originalTask) => {
  try {
    const sql = `
      UPDATE checklist
      SET 
        department = $1,
        given_by = $2,
        name = $3,
        task_description = $4,
        enable_reminder = $5,
        require_attachment = $6,
        remark = $7
      WHERE department = $8
      AND name = $9
      AND task_description = $10
      AND submission_date IS NULL
      RETURNING *;
    `;

    const values = [
      updatedTask.department,
      updatedTask.given_by,
      updatedTask.name,
      updatedTask.task_description,
      updatedTask.enable_reminder,
      updatedTask.require_attachment,
      updatedTask.remark,

      originalTask.department,
      originalTask.name,
      originalTask.task_description
    ];

    const res = await pool.query(sql, values);
    return res.rows;
  } catch (err) {
    console.log(err);
    throw err;
  }
};

// ------------------------ FETCH USERS (UNIQUE NAMES) ------------------------
export const fetchUsers = async () => {
  try {
    const sql = `
      SELECT name
      FROM (
        SELECT DISTINCT name FROM checklist WHERE name IS NOT NULL AND name <> ''
        UNION
        SELECT DISTINCT name FROM delegation WHERE name IS NOT NULL AND name <> ''
      ) t
      ORDER BY LOWER(name)
    `;

    const { rows } = await pool.query(sql);
    // Normalize shape similar to existing frontend expectation (user_name)
    return rows.map((r) => ({ user_name: r.name }));
  } catch (err) {
    console.log(err);
    return [];
  }
};
