import pg from "pg";
import dotenv from "dotenv";

dotenv.config();
const { Pool } = pg;

const pool = new Pool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT,
  ssl: { rejectUnauthorized: false }, // required for AWS RDS
});

pool
  .connect()
  .then(() => console.log("✅ Connected to AWS RDS PostgreSQL"))
  .catch((err) => console.error("❌ Database connection error:", err.message));

  export default pool;

// const pool2 = new Pool({
//   host: process.env.DB_HOST,
//   user: process.env.DB_USER,
//   password: process.env.DB_PASSWORD,
//   database: process.env.DB_NAME_2,
//   port: process.env.DB_PORT,
//   ssl: { rejectUnauthorized: false }, // required for AWS RDS
// });

// pool
//   .connect()
//   .then(() => console.log("✅ Connected to AWS RDS PostgreSQL"))
//   .catch((err) => console.error("❌ Database connection error:", err.message));


// export { pool, pool2 };


