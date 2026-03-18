// controllers/loginController.js
import pool from "../config/db.js";

// Map to store active SSE connections: username -> Response[]
export const activeClients = new Map();

export const authStream = (req, res) => {
  const { username } = req.query;
  if (!username) {
    return res.status(400).end();
  }

  // Setup Server-Sent Events headers
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders(); 

  // Send an initial heartbeat to confirm connection
  res.write("data: connected\n\n");

  if (!activeClients.has(username)) {
    activeClients.set(username, []);
  }
  activeClients.get(username).push(res);

  // Remove connection when client disconnects
  req.on("close", () => {
    const clients = activeClients.get(username) || [];
    activeClients.set(
      username,
      clients.filter((client) => client !== res)
    );
  });
};

export const triggerUserLogout = (username) => {
  const clients = activeClients.get(username);
  if (clients && clients.length > 0) {
    clients.forEach((client) => {
      client.write("event: logout\ndata: {}\n\n");
    });
  }
};

export const loginUserController = async (req, res) => {
  try {
    const { username, password } = req.body;

    // Validate input
    if (!username || !password)
      return res.status(400).json({ error: "Username and Password are required" });

    // Query PostgreSQL
    const query = `
      SELECT user_name, password, role, status, email_id, user_access, unit, division, department, system_access, page_access 
      FROM users 
      WHERE user_name = $1 AND password = $2
      LIMIT 1
    `;

    const { rows } = await pool.query(query, [username, password]);

    // No user found
    if (rows.length === 0) {
      return res.status(401).json({ error: "Invalid username or password" });
    }

    const user = rows[0];

    // Check active status
    if (user.status !== "active") {
      return res.status(403).json({ error: "Your account is inactive. Contact admin." });
    }

    return res.json({
      user_name: user.user_name,
      role: user.role,
      email_id: user.email_id,
      user_access: user.user_access,
      unit: user.unit,
      division: user.division,
      department: user.department,
      system_access: user.system_access,
      page_access: user.page_access
    });

  } catch (err) {
    console.error("Login Error:", err);
    res.status(500).json({ error: "Server Error" });
  }
};
