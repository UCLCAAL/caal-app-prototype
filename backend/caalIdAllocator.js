const pool = require("./db");

async function allocateCaalId(clientOrPool, { recordType, prefix }) {
  const db = clientOrPool || pool;

  if (!recordType) {
    throw new Error("Missing recordType for CAAL ID allocation");
  }

  if (!prefix || !String(prefix).trim()) {
    throw new Error("Missing CAAL ID prefix for this user");
  }

  const result = await db.query(
    `
    SELECT public.next_caal_id($1, $2, 6, '-') AS caal_id
    `,
    [recordType, String(prefix).trim()]
  );

  const caalId = result.rows[0]?.caal_id;

  if (!caalId) {
    throw new Error("CAAL ID allocation failed");
  }

  return caalId;
}

module.exports = {
  allocateCaalId
};