import pool from "../config/db.js";

import upload, { uploadToS3 } from "../middleware/s3Upload.js";
import { sendWhatsAppMessage } from "../services/whatsappService.js";
// -----------------------------------------
// 1️⃣ GET PENDING CHECKLIST
export const getPendingChecklist = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const username = req.query.username;
    const role = req.query.role;
    const search = req.query.search || '';

    const limit = 50;
    const offset = (page - 1) * limit;

    // Include future tasks up to 1 year ahead (frontend will filter by frequency)
    // This allows showing upcoming tasks based on frequency (daily: +1 day, weekly: +7 days, etc.)
    let where = `
  submission_date IS NULL
  AND DATE(task_start_date) <= CURRENT_DATE + INTERVAL '365 days'
`;


    // ⭐ If user is NOT admin → filter by name
    if (role !== "admin" && username) {
      where += ` AND LOWER(name) = LOWER('${username}') `;
    }

    // ⭐ Add search filter if search term is provided
    if (search.trim()) {
      const searchLower = search.toLowerCase().replace(/'/g, "''"); // Escape single quotes
      where += ` AND (
        LOWER(name) LIKE '%${searchLower}%' OR
        LOWER(task_description) LIKE '%${searchLower}%' OR
        LOWER(department) LIKE '%${searchLower}%' OR
        LOWER(given_by) LIKE '%${searchLower}%' OR
        CAST(task_id AS TEXT) LIKE '%${searchLower}%'
      ) `;
    }

    const query = `
      SELECT *,
        COUNT(*) OVER() AS total_count
      FROM checklist
      WHERE ${where}
      ORDER BY task_start_date ASC
      LIMIT $1 OFFSET $2
    `;

    const { rows } = await pool.query(query, [limit, offset]);

    const totalCount = rows.length > 0 ? rows[0].total_count : 0;

    res.json({
      data: rows,
      page,
      totalCount
    });
  } catch (error) {
    console.error("❌ Error fetching pending checklist:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};




// -----------------------------------------
// 2️⃣ GET HISTORY CHECKLIST
// -----------------------------------------
export const getChecklistHistory = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const username = req.query.username;
    const role = req.query.role;

    const limit = 50;
    const offset = (page - 1) * limit;

    let where = `submission_date IS NOT NULL`;

    // ⭐ Normal users see only their own tasks
    if (role !== "admin" && username) {
      where += ` AND LOWER(name) = LOWER('${username}') `;
    }

    const query = `
      SELECT *,
        COUNT(*) OVER() AS total_count
      FROM checklist
      WHERE ${where}
      ORDER BY submission_date DESC
      LIMIT $1 OFFSET $2
    `;

    const { rows } = await pool.query(query, [limit, offset]);

    const totalCount = rows.length > 0 ? rows[0].total_count : 0;

    res.json({
      data: rows,
      page,
      totalCount
    });
  } catch (error) {
    console.error("❌ Error fetching history:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};



// -----------------------------------------
// 3️⃣ UPDATE CHECKLIST (User Submit)
// -----------------------------------------
export const updateChecklist = async (req, res) => {
  try {
    const items = req.body;

    if (!Array.isArray(items) || items.length === 0)
      return res.status(400).json({ error: "Invalid data" });

    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      for (const item of items) {
        // 🔥 Fix status
        const safeStatus =
          (item.status || "").toLowerCase() === "yes" ? "yes" : "no";

        // ---------------------------------
        // 🔥🔥 FIX: IMAGE HANDLING
        // ---------------------------------
        let finalImageUrl = null;

        if (item.image && typeof item.image === "string") {
          if (item.image.startsWith("data:image")) {
            // Base64 → Buffer
            const base64Data = item.image.split(";base64,").pop();
            const buffer = Buffer.from(base64Data, "base64");

            const fakeFile = {
              originalname: `task_${item.taskId}_${Date.now()}.jpg`,
              buffer,
              mimetype: "image/jpeg",
            };

            // Upload to S3
            finalImageUrl = await uploadToS3(fakeFile);
          } else {
            // Already S3 URL or old string
            finalImageUrl = item.image;
          }
        }

        // ---------------------------------
        // 🔥 SAVE TO DATABASE
        // ---------------------------------
        const sql = `
          UPDATE checklist
          SET 
           status = $1,
            remark = $2,
            submission_date = NOW(),
            image = $3
          WHERE task_id = $4
        `;

        await client.query(sql, [
          safeStatus,
          item.remarks || "",
          finalImageUrl,
          item.taskId,
        ]);
      }

      await client.query("COMMIT");
      res.json({ message: "Checklist updated successfully" });
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error("❌ updateChecklist Error:", err);
    res.status(500).json({ error: err.message });
  }
};



// -----------------------------------------
// 4️⃣ ADMIN DONE UPDATE
// -----------------------------------------
export const adminDoneChecklist = async (req, res) => {
  try {
    const items = req.body;

    if (!items || items.length === 0)
      return res.status(400).json({ error: "No items provided" });

    const sql = `
      UPDATE checklist
      SET admin_done = 'Done'
      WHERE task_id = ANY($1::bigint[])
    `;

    const ids = items.map(i => i.task_id);

    await pool.query(sql, [ids]);

    res.json({ message: "Admin updated successfully" });

  } catch (err) {
    console.error("❌ adminDoneChecklist Error:", err);
    res.status(500).json({ error: err.message });
  }
};


// -----------------------------------------
// 5️⃣ SEND WHATSAPP NOTIFICATION (Admin Only)
// -----------------------------------------
export const sendWhatsAppNotification = async (req, res) => {
  try {
    const { items } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: "No items provided" });
    }

    const results = [];

    for (const item of items) {
      const doerName = item.name;
      
      // Look up doer's phone number from users table
      const userResult = await pool.query(
        'SELECT number FROM users WHERE user_name = $1',
        [doerName]
      );

      if (userResult.rows.length === 0 || !userResult.rows[0].number) {
        results.push({
          name: doerName,
          success: false,
          error: 'Phone number not found'
        });
        continue;
      }

      const phoneNumber = userResult.rows[0].number;

      // Format date for message
      const formatDate = (dateStr) => {
        if (!dateStr) return 'N/A';
        try {
          const date = new Date(dateStr);
          if (isNaN(date.getTime())) return dateStr;
          const year = date.getFullYear();
          const month = String(date.getMonth() + 1).padStart(2, '0');
          const day = String(date.getDate()).padStart(2, '0');
          const hours = String(date.getHours()).padStart(2, '0');
          const minutes = String(date.getMinutes()).padStart(2, '0');
          const seconds = String(date.getSeconds()).padStart(2, '0');
          return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
        } catch (e) {
          return dateStr;
        }
      };

      // App link
      const appLink = 'https://checklist-frontend-eight.vercel.app';

      // Create urgent task alert message
      const message = `🚨 URGENT TASK ALERT 🚨

Name: ${doerName}
Task ID: ${item.task_id || 'N/A'}
Task: ${item.task_description || 'N/A'}s
Planned Date: ${formatDate(item.task_start_date)}
Given By: ${item.given_by || 'N/A'}

📌 Please take immediate action and update once completed.

🔗 *App Link:*
${appLink}`;

      // Send WhatsApp message
      const result = await sendWhatsAppMessage(phoneNumber, message);

      results.push({
        name: doerName,
        success: result.success,
        error: result.error || null
      });
    }

    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;

    res.json({
      message: `WhatsApp sent: ${successCount} success, ${failCount} failed`,
      results
    });

  } catch (err) {
    console.error("❌ sendWhatsAppNotification Error:", err);
    res.status(500).json({ error: err.message });
  }
};
