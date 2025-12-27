import pool from "../config/db.js";
import { uploadToS3 } from "../middleware/s3Upload.js";


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
        AND (status IS NULL OR status = '' OR status = 'extend' OR status = 'pending')
        ORDER BY task_start_date ASC;
      `;
    }

    // ADMIN: fetch ALL pending tasks (ignore user_access)
    else if (role === "admin") {
      query = `
        SELECT *
        FROM delegation
        WHERE (status IS NULL OR status = '' OR status = 'extend' OR status = 'pending')
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
    if (role === "admin" && userAccess) {
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
        (task_id, status, next_extend_date, reason, image_url, name, task_description, given_by)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
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
        task.given_by
      ];

      console.log("💾 INSERT delegation_done:", insertValues);

      const inserted = await client.query(insertQuery, insertValues);


      /* -----------------------------------------
         4️⃣ UPDATE delegation (main table)
      ------------------------------------------ */

      const updateQuery = `
        UPDATE delegation
        SET status = $1,
            submission_date = NOW(),
            updated_at = NOW(),
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
  try {
    const items = req.body;

    if (!items || items.length === 0)
      return res.status(400).json({ error: "No items provided" });

    const sql = `
      UPDATE delegation_done
      SET admin_done = 'Done'
      WHERE id = ANY($1::bigint[])
    `;

    const ids = items.map(i => i.id);

    await pool.query(sql, [ids]);

    res.json({ message: "Delegation admin approval updated successfully" });

  } catch (err) {
    console.error("❌ adminDoneDelegation Error:", err);
    res.status(500).json({ error: err.message });
  }
};
