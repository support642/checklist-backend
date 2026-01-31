import pool from "../config/db.js";
import { uploadToS3 } from "../middleware/s3Upload.js";
import { sendWhatsAppMessage, sendDelegationExtensionNotification } from "../services/whatsappService.js";


/* ------------------------------------------------------
   FETCH PENDING + EXTEND TASKS (delegation)
------------------------------------------------------ */
export const fetchDelegationDataSortByDate = async (req, res) => {
  const role = req.query.role;
  const username = req.query.username;

  try {
    let query = "";

    console.log("PARAMS →", req.query);

    // USER: only own pending
    if (role === "user") {
      query = `
        SELECT *
        FROM delegation
        WHERE name = '${username}'
        AND (
          (status IS NULL OR status = '' OR status = 'extend' OR status = 'pending')
          OR (planned_date IS NOT NULL AND submission_date IS NULL)
        )
        ORDER BY task_start_date ASC;
      `;
    }

    // ADMIN: fetch ALL pending tasks (ignore user_access)
    else if (role === "admin" || role === "super_admin") {
      query = `
        SELECT *
        FROM delegation
        WHERE (
          (status IS NULL OR status = '' OR status = 'extend' OR status = 'pending')
          OR (planned_date IS NOT NULL AND submission_date IS NULL)
        )
        ORDER BY task_start_date ASC;
      `;
    }

    // NO ROLE (fallback)
    else {
      query = `
        SELECT *
        FROM delegation
        ORDER BY task_start_date ASC;
      `;
    }

    console.log("FINAL QUERY →", query);

    const { rows } = await pool.query(query);
    return res.json(rows);

  } catch (err) {
    console.log("Pending fetch error:", err);
    return res.status(400).json({ error: err.message });
  }
};


/* ------------------------------------------------------
   FETCH DONE TASKS (delegation_done)
------------------------------------------------------ */
export const fetchDelegation_DoneDataSortByDate = async (req, res) => {
  const role = req.query.role;
  const username = req.query.username;
  const userAccess = req.query.user_access;

  try {
    let query = `
      SELECT *
      FROM delegation_done
      ORDER BY created_at DESC;
    `;

    // USER LEVEL FILTER
    if (role === "user") {
      query = `
        SELECT *
        FROM delegation_done
        WHERE name = '${username}'
        ORDER BY created_at DESC;
      `;
    }

    // ADMIN FILTER — ONLY IF YOU ADD department COLUMN IN delegation_done
    if ((role === "admin" || role === "super_admin") && userAccess) {
      const depts = userAccess
        .replace(/\+/g, " ")
        .split(",")
        .map((d) => `'${d.trim().toLowerCase()}'`)
        .join(",");

      // Check if department column exists
      query = `
        SELECT *
        FROM delegation_done
        ORDER BY created_at DESC;
      `;
    }

    const { rows } = await pool.query(query);
    return res.json(rows);
  } catch (err) {
    console.log("Done fetch error:", err);
    return res.status(400).json({ error: err.message });
  }
};

/* ------------------------------------------------------
  INSERT INTO delegation_done AND UPDATE delegation
------------------------------------------------------ */
// export const insertDelegationDoneAndUpdate = async (req, res) => {
//   try {
//     console.log("REQ BODY 👉", req.body);

//     const selectedDataArray = req.body.selectedData;

//     if (!selectedDataArray || !Array.isArray(selectedDataArray)) {
//       return res.status(400).json({ error: "selectedData missing or invalid" });
//     }

//     const client = await pool.connect();
//     const results = [];

//     for (const task of selectedDataArray) {
      
//       const statusForDone =
//         task.status === "done"
//           ? "completed"
//           : task.status === "extend"
//           ? "extend"
//           : "in_progress";

//       const statusForDelegation =
//         task.status === "done"
//           ? "done"
//           : task.status === "extend"
//           ? "extend"
//           : null;

//       /* INSERT INTO delegation_done WITHOUT department */
//       const insertQuery = `
//         INSERT INTO delegation_done
//         (task_id, status, next_extend_date, reason, image_url, name, task_description, given_by)
//         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
//         RETURNING *;
//       `;

//       const insertValues = [
//         task.task_id,
//         statusForDone,
//         task.next_extend_date || null,
//         task.reason || "",
//         task.image_url || null,
//         task.name,
//         task.task_description,
//         task.given_by
//       ];

//       const inserted = await client.query(insertQuery, insertValues);

//       /* UPDATE delegation */
//       const updateQuery = `
//         UPDATE delegation
//         SET status = $1,
//             submission_date = NOW(),
//             updated_at = NOW(),
//             remarks = $2,
//             planned_date = $3
//         WHERE task_id = $4
//         RETURNING *;
//       `;

//       const updateValues = [
//         statusForDelegation,
//         task.reason || "",
//         task.next_extend_date || task.planned_date,
//         task.task_id
//       ];

//       const updated = await client.query(updateQuery, updateValues);

//       results.push({
//         done: inserted.rows[0],
//         updated: updated.rows[0]
//       });
//     }

//     return res.json(results);

//   } catch (err) {
//     console.error("Insert error:", err);
//     return res.status(500).json({ error: err.message });
//   }
// };


export const insertDelegationDoneAndUpdate = async (req, res) => {
  const client = await pool.connect();

  try {
    console.log("🔄 Incoming Delegation Submit Body:");
    console.log(JSON.stringify(req.body, null, 2));

    const selectedDataArray = req.body.selectedData;

    if (!selectedDataArray || !Array.isArray(selectedDataArray)) {
      return res.status(400).json({ error: "selectedData missing or invalid" });
    }

    await client.query("BEGIN");
    const results = [];

    for (const task of selectedDataArray) {
      console.log("\n==============================================");
      console.log(`🔍 Processing Task ID: ${task.task_id}`);

      /* -----------------------------------------
         1️⃣ Decide Final Status for Tables
      ------------------------------------------ */
      const statusForDone =
        task.status === "done"
          ? "completed"
          : task.status === "extend"
          ? "extend"
          : "in_progress";

      const statusForDelegation =
        task.status === "done"
          ? "done"
          : task.status === "extend"
          ? "extend"
          : null;

      /* -----------------------------------------
         2️⃣ Handle Image Uploads
      ------------------------------------------ */

      let finalImageUrl = null;

      if (task.image_base64 && typeof task.image_base64 === "string") {
        try {
          // CASE 1: NEW UPLOAD (BASE64)
          if (task.image_base64.startsWith("data:image")) {
            console.log("📸 Base64 image detected → Uploading to S3...");

            const base64Data = task.image_base64.split(";base64,").pop();
            const buffer = Buffer.from(base64Data, "base64");

            const fakeFile = {
              originalname: `delegation_${task.task_id}_${Date.now()}.jpg`,
              buffer,
              mimetype: "image/jpeg",
            };

            finalImageUrl = await uploadToS3(fakeFile);
            console.log("✅ Uploaded to S3:", finalImageUrl);
          }

          // CASE 2: ALREADY S3 URL
          else if (task.image_base64.startsWith("http")) {
            console.log("ℹ Existing S3 image detected → Keeping original URL");
            finalImageUrl = task.image_base64;
          }

          // CASE 3: Invalid image string
          else {
            console.log("⚠ Invalid image string → Skipping image");
            finalImageUrl = null;
          }

        } catch (imageError) {
          console.error("❌ Image processing error:", imageError);
          finalImageUrl = null; // continue without breaking
        }

      } else {
        console.log("❌ No image_base64 sent");
      }

      console.log(`📝 Final Image URL: ${finalImageUrl}`);


      /* -----------------------------------------
         3️⃣ INSERT into delegation_done
      ------------------------------------------ */

      const insertQuery = `
        INSERT INTO delegation_done
        (task_id, status, next_extend_date, reason, image_url, name, task_description, given_by, department, task_start_date, planned_date)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
        RETURNING *;
      `;

      const insertValues = [
        task.task_id,
        statusForDone,
        task.next_extend_date || null,
        task.reason || "",
        finalImageUrl,
        task.name,
        task.task_description,
        task.given_by,
        task.department,
        task.task_start_date,
        task.planned_date
      ];

      console.log("💾 INSERT delegation_done:", insertValues);

      const inserted = await client.query(insertQuery, insertValues);


      /* -----------------------------------------
         4️⃣ UPDATE delegation (main table)
      ------------------------------------------ */

      const updateQuery = `
        UPDATE delegation
        SET status = $1,
            submission_date = date_trunc('second', NOW() AT TIME ZONE 'Asia/Kolkata'),
            updated_at = NOW() AT TIME ZONE 'Asia/Kolkata',
            remarks = $2,
            planned_date = $3,
            image = $4
        WHERE task_id = $5
        RETURNING *;
      `;

      const updateValues = [
        statusForDelegation,
        task.reason || "",
        task.next_extend_date || task.planned_date,
        finalImageUrl,
        task.task_id
      ];

      console.log("💾 UPDATE delegation:", updateValues);

      const updated = await client.query(updateQuery, updateValues);

      results.push({
        saved_to_done_table: inserted.rows[0],
        updated_in_main_table: updated.rows[0],
      });

      // Special Notification for Extension (only if remarks are filled)
      if (task.status === "extend" && task.reason && task.reason.trim() !== "") {
        try {
          console.log(`📲 Sending WhatsApp extension notification for Task ID: ${task.task_id}`);
          await sendDelegationExtensionNotification(task);
        } catch (notifErr) {
          console.error("❌ Notification error:", notifErr);
          // Don't fail the whole transaction if notification fails
        }
      }
    }

    /* -----------------------------------------
       5️⃣ COMMIT TRANSACTION
    ------------------------------------------ */
    await client.query("COMMIT");
    console.log("✅ ALL TASKS SAVED SUCCESSFULLY");

    return res.json({ success: true, results });

  } catch (err) {
    await client.query("ROLLBACK");
    console.error("❌ Transaction Failed:", err);
    return res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
};


/* ------------------------------------------------------
   ADMIN DONE - Mark delegation as admin approved
------------------------------------------------------ */
export const adminDoneDelegation = async (req, res) => {
  const client = await pool.connect();
  try {
    const items = req.body;

    if (!items || items.length === 0)
      return res.status(400).json({ error: "No items provided" });

    await client.query("BEGIN");

    const sql = `
      UPDATE delegation_done
      SET admin_done = 'Done',
          admin_done_remarks = $2
      WHERE id = $1
    `;

    for (const item of items) {
      // item must have id, optional remarks
      await client.query(sql, [item.id, item.remarks || null]);
    }

    await client.query("COMMIT");

    res.json({ message: "Delegation admin approval updated successfully" });

  } catch (err) {
    await client.query("ROLLBACK");
    console.error("❌ adminDoneDelegation Error:", err);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
};


/* ------------------------------------------------------
   SEND WHATSAPP NOTIFICATION FOR DELEGATION (Admin)
------------------------------------------------------ */
export const sendDelegationWhatsAppNotification = async (req, res) => {
  try {
    const { items } = req.body; // Array of selected delegation items

    if (!items || items.length === 0) {
      return res.status(400).json({ error: 'No items provided' });
    }

    console.log(`📱 Processing ${items.length} delegation WhatsApp notifications...`);

    const results = [];

    for (const item of items) {
      const doerName = item.name;

      // Look up phone number from users table
      const userResult = await pool.query(
        'SELECT number FROM users WHERE user_name = $1',
        [doerName]
      );

      if (userResult.rows.length === 0 || !userResult.rows[0].number) {
        console.log(`⚠️ No phone number found for: ${doerName}`);
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
Task: ${item.task_description || 'N/A'}
Planned Date: ${formatDate(item.planned_date || item.task_start_date)}
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
    console.error("❌ sendDelegationWhatsAppNotification Error:", err);
    res.status(500).json({ error: err.message });
  }
};
