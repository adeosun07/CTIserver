import dotenv from "dotenv";
dotenv.config();

import pkg from "pg";
const { Pool } = pkg;

/*
  Create a Postgres connection pool using `pg`.

  Environment variables supported (common names are accepted):
  - DB_HOST or PGHOST (defaults to 'localhost')
  - DB_USER or PGUSER
  - DB_PASSWORD or PGPASSWORD
  - DB_NAME or PGDATABASE
  - DB_PORT or PGPORT (defaults to 5432)
  - DB_MAX_CLIENTS (optional, defaults to 10)
  - DB_IDLE_TIMEOUT (ms, optional, defaults to 30000)
  - DB_CONN_TIMEOUT (ms, optional, defaults to 2000)
  - DB_SSL ('true' to enable a basic ssl option)

  All numeric env vars are parsed to integers to avoid type issues.
*/
const pool = new Pool({
  host: process.env.DB_HOST || process.env.PGHOST || "localhost",
  user: process.env.DB_USER || process.env.PGUSER,
  password: process.env.DB_PASSWORD || process.env.PGPASSWORD,
  database: process.env.DB_NAME || process.env.PGDATABASE,
  port: process.env.DB_PORT
    ? parseInt(process.env.DB_PORT, 10)
    : process.env.PGPORT
      ? parseInt(process.env.PGPORT, 10)
      : 5432,
  max: process.env.DB_MAX_CLIENTS
    ? parseInt(process.env.DB_MAX_CLIENTS, 10)
    : 10,
  idleTimeoutMillis: process.env.DB_IDLE_TIMEOUT
    ? parseInt(process.env.DB_IDLE_TIMEOUT, 10)
    : 30000,
  connectionTimeoutMillis: process.env.DB_CONN_TIMEOUT
    ? parseInt(process.env.DB_CONN_TIMEOUT, 10)
    : 2000,
  // Enable a simple SSL option when DB_SSL=true. For production, provide
  // a proper SSL configuration and certificate verification as needed.
  ssl:
   { rejectUnauthorized: false},
});


// Log unexpected errors emitted by a client in the pool.
pool.on("error", (err) => {
  console.error("Unexpected idle client error", err);
});

/*
  testConnection(): Acquire a client from the pool, run a lightweight query,
  and release the client. This is useful for quick health checks.
*/
async function testConnection() {
  const client = await pool.connect();
  try {
    await client.query("SELECT 1");
    console.log("Database connection OK");
  } finally {
    client.release();
  }
}

// Default export is the pool for convenience; also export named bindings
export default pool;
export { pool, testConnection };

// If `db.js` is executed directly (node db.js), run a quick connection test.
if (process.argv[1] && process.argv[1].endsWith("db.js")) {
  testConnection().catch((err) => {
    console.error("DB connection failed", err);
    process.exit(1);
  });
}
