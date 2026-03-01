import pool from "../config/db.js";
import { uploadToS3 } from "../middleware/s3Upload.js";
import { sendTaskAssignmentNotification } from "../services/whatsappService.js";

// 0️⃣ User Profile (for AssignTaskUser pre-fill)
export const getUserProfile = async (req, res) => {
  try {
    const { username } = req.params;
    const { rows } = await pool.query(
      `SELECT user_name, unit, division, department FROM users WHERE user_name = $1 LIMIT 1`,
      [username]
    );
    if (rows.length === 0) return res.status(404).json({ error: "User not found" });
    res.json(rows[0]);
  } catch (e) {
    console.error(e);
    res.status(500).send("Server Error");
  }
};

// 1️⃣ Departments
export const getUniqueDepartments = async (req, res) => {
  try {
    const user_name = req.params.user_name;

    const user = await pool.query(
      `SELECT role, user_access FROM users WHERE user_name=$1`,
      [user_name]
    );

    if (user.rows.length === 0)
      return res.status(404).json({ message: "User not found" });

    if (user.rows[0].role === "admin" || user.rows[0].role === "super_admin") {
      const result = await pool.query(`
        SELECT DISTINCT department
        FROM users
        WHERE department IS NOT NULL
        ORDER BY department ASC
      `);
      return res.json(result.rows.map(r => r.department));
    }

    const result = await pool.query(
      `SELECT DISTINCT department FROM users WHERE LOWER(department)=LOWER($1)`,
      [user.rows[0].user_access]
    );

    return res.json(result.rows.map(r => r.department));
  } catch (e) {
    console.error(e);
    res.status(500).send("Server Error");
  }
};

// 2️⃣ Given By
export const getUniqueGivenBy = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT DISTINCT given_by 
      FROM users 
      WHERE given_by IS NOT NULL
      ORDER BY given_by ASC
    `);
    res.json(result.rows.map(r => r.given_by));
  } catch (e) {
    console.error(e);
    res.status(500).send("Server Error");
  }
};

// 3️⃣ Doer Names (FIXED ✔) — now also filters by unit & division
export const getUniqueDoerNames = async (req, res) => {
  try {
    const { department } = req.params;
    const { unit, division } = req.query;

    let query = `SELECT DISTINCT user_name
       FROM users 
       WHERE status='active'
         AND LOWER(department) = LOWER($1)`;
    const params = [department];

    if (unit) {
      params.push(unit);
      query += ` AND LOWER(unit) = LOWER($${params.length})`;
    }
    if (division) {
      params.push(division);
      query += ` AND LOWER(division) = LOWER($${params.length})`;
    }

    query += ` ORDER BY user_name ASC`;

    const result = await pool.query(query, params);

    res.json(result.rows.map(r => r.user_name));
  } catch (e) {
    console.error(e);
    res.status(500).send("Server Error");
  }
};

// 3b️⃣ All Doer Names (no department filter)
export const getAllDoerNames = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT DISTINCT user_name
       FROM users 
       WHERE status='active'
       ORDER BY user_name ASC`
    );
    res.json(result.rows.map(r => r.user_name));
  } catch (e) {
    console.error(e);
    res.status(500).send("Server Error");
  }
};

// 4️⃣ Working days
export const getWorkingDays = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT working_date, day, week_num, month
      FROM working_day_calender
      ORDER BY working_date ASC
    `);

    res.json(result.rows);
  } catch (e) {
    console.error(e);
    res.status(500).send("Server Error");
  }
};

// 5️⃣ Insert Assign Tasks
export const postAssignTasks = async (req, res) => {
  try {
    const tasks = req.body;

    // Step A: Upload image to S3 (if exists)
    let imageUrl = null;
    if (req.file) {
      imageUrl = await uploadToS3(req.file);
    }

    const isOneTime = tasks[0].frequency === "one-time";
    const table = isOneTime ? "delegation" : "checklist";

    if (isOneTime) {
      // ----- DELEGATION INSERT -----
      const values = [];
      const params = [];

      tasks.forEach((t, i) => {
        values.push(
          `($${i * 13 + 1}, $${i * 13 + 2}, $${i * 13 + 3}, $${i * 13 + 4}, $${i * 13 + 5},
            $${i * 13 + 6}, $${i * 13 + 7}, $${i * 13 + 8}, $${i * 13 + 9}, $${i * 13 + 10}, $${i * 13 + 11}, $${i * 13 + 12}, $${i * 13 + 13})`
        );
        params.push(
          t.department,
          t.givenBy,
          t.doer,
          t.description,
          t.frequency,
          t.enableReminders ? "yes" : "no",
          t.requireAttachment ? "yes" : "no",
          t.dueDate,           // planned_date (the selected end/due date)
          null,                // status
          t.taskStartDate || new Date().toISOString().slice(0, 19).replace('T', ' '),  // task_start_date (from frontend or current timestamp)
          imageUrl,            // image
          t.unit || null,      // unit
          t.division || null   // division
        );
      });

      const result = await pool.query(
        `INSERT INTO delegation 
        (department, given_by, name, task_description, frequency,
         enable_reminder, require_attachment, planned_date, status, task_start_date, image, unit, division)
        VALUES ${values.join(",")}
        RETURNING task_id`,
        params
      );

      // Store the first inserted task_id for WhatsApp notification
      var insertedTaskId = result.rows.length > 0 ? result.rows[0].task_id : null;

    } else {
      // ----- CHECKLIST INSERT -----
      const values = [];
      const params = [];

      tasks.forEach((t, i) => {

        const startDate = t.taskStartDate || t.startDate || t.dueDate;

        values.push(
          `($${i * 16 + 1}, $${i * 16 + 2}, $${i * 16 + 3}, $${i * 16 + 4}, $${i * 16 + 5},
      $${i * 16 + 6}, $${i * 16 + 7}, $${i * 16 + 8}, $${i * 16 + 9},
      $${i * 16 + 10}, $${i * 16 + 11}, $${i * 16 + 12}, $${i * 16 + 13}, $${i * 16 + 14}, $${i * 16 + 15}, $${i * 16 + 16})`
        );

        params.push(
          t.department,                 // 1
          t.givenBy,                    // 2
          t.doer,                       // 3
          t.description,                // 4
          t.enableReminders ? "yes" : "no",  // 5
          t.requireAttachment ? "yes" : "no", // 6
          t.frequency,                    // 7
          null,                          // 8 remark
          null,                          // 9 status
          imageUrl,                      // 10 image
          null,                          // 11 admin_done
          startDate,                     // 12 planned_date
          startDate,                     // 13 task_start_date
          null,                          // 14 submission_date
          t.unit || null,                // 15 unit
          t.division || null             // 16 division
        );
      });


      const result = await pool.query(
        `INSERT INTO checklist 
        (department, given_by, name, task_description, enable_reminder,
         require_attachment, frequency, remark, status, image, admin_done,
         planned_date, task_start_date, submission_date, unit, division)
        VALUES ${values.join(",")}
        RETURNING task_id`,
        params
      );

      // Store the first inserted task_id for WhatsApp notification
      var insertedTaskId = result.rows.length > 0 ? result.rows[0].task_id : null;
    }

    // 🔔 Send WhatsApp notification to the doer
    try {
      const doerName = tasks[0].doer;

      // Look up doer's phone number from users table
      const userResult = await pool.query(
        'SELECT number FROM users WHERE user_name = $1',
        [doerName]
      );

      if (userResult.rows.length > 0 && userResult.rows[0].number) {
        const phoneNumber = userResult.rows[0].number;

        // Send notification asynchronously (don't block response)
        sendTaskAssignmentNotification(phoneNumber, {
          doerName: doerName,
          taskId: insertedTaskId || 'N/A',
          givenBy: tasks[0].givenBy,
          description: tasks[0].description,
          dueDate: tasks[0].dueDate || tasks[0].taskStartDate || tasks[0].startDate,
          frequency: tasks[0].frequency
        }).then(result => {
          if (result.success) {
            console.log(`✅ WhatsApp notification sent to ${doerName}`);
          } else {
            console.log(`⚠️ WhatsApp notification failed for ${doerName}:`, result.error);
          }
        }).catch(err => {
          console.error(`❌ WhatsApp notification error for ${doerName}:`, err.message);
        });
      } else {
        console.log(`ℹ️ No phone number found for doer: ${doerName}`);
      }
    } catch (notifyError) {
      // Don't fail the task creation if notification fails
      console.error('❌ WhatsApp notification error:', notifyError.message);
    }

    res.json({
      message: "Tasks inserted",
      count: tasks.length,
      image: imageUrl
    });

  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
};





