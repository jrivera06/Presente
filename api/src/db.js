import pg from 'pg';

export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
});

export async function ensureEmployee({ oid, name, email }) {
  const { rows } = await pool.query(
    `INSERT INTO employees (entra_oid, display_name, email)
     VALUES ($1, $2, $3)
     ON CONFLICT (entra_oid) DO UPDATE SET display_name = EXCLUDED.display_name, email = EXCLUDED.email
     RETURNING *`,
    [oid, name, email]
  );
  return rows[0];
}

export async function getOpenShift(employeeId) {
  const { rows } = await pool.query(
    `SELECT * FROM shifts WHERE employee_id = $1 AND status = 'open' ORDER BY started_at DESC LIMIT 1`,
    [employeeId]
  );
  return rows[0] ?? null;
}

function weekStart(date = new Date()) {
  const d = new Date(date);
  const day = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - day);
  return d.toISOString().slice(0, 10);
}

export async function clockIn(employee, source = 'teams') {
  const open = await getOpenShift(employee.id);
  if (open) return { shift: open, action: 'already_in' };
  const { rows } = await pool.query(
    `INSERT INTO shifts (employee_id, started_at, week_start) VALUES ($1, now(), $2) RETURNING *`,
    [employee.id, weekStart()]
  );
  await pool.query(
    `INSERT INTO shift_events (employee_id, type, source) VALUES ($1, 'clock_in', $2)`,
    [employee.id, source]
  );
  return { shift: rows[0], action: 'clock_in' };
}

export async function clockOut(employee, source = 'teams') {
  const open = await getOpenShift(employee.id);
  if (!open) return { action: 'not_in' };

  const lateMinutes = computeLateMinutes(employee, open.started_at);
  const minutes = Math.floor((Date.now() - new Date(open.started_at).getTime()) / 60000);
  const { rows } = await pool.query(
    `UPDATE shifts
       SET ended_at = now(),
           minutes_worked = $2,
           late_minutes = $3,
           status = 'closed'
     WHERE id = $1
     RETURNING *`,
    [open.id, minutes, lateMinutes]
  );
  await pool.query(
    `INSERT INTO shift_events (employee_id, type, source) VALUES ($1, 'clock_out', $2)`,
    [employee.id, source]
  );
  return { shift: rows[0], action: 'clock_out' };
}

function computeLateMinutes(employee, startedAt) {
  const [h, m] = String(employee.schedule_start).split(':').map(Number);
  const start = new Date(startedAt);
  const scheduled = new Date(start);
  scheduled.setUTCHours(h, m, 0, 0);
  const late = Math.floor((start - scheduled) / 60000);
  return late > 0 ? late : 0;
}

export async function getWeekSummary(employeeId, week) {
  const { rows } = await pool.query(
    `SELECT COALESCE(SUM(minutes_worked), 0) AS total_minutes,
            COALESCE(SUM(he_minutes), 0) AS he_minutes,
            COALESCE(SUM(late_minutes), 0) AS late_minutes
       FROM shifts
      WHERE employee_id = $1 AND week_start = $2 AND status <> 'open'`,
    [employeeId, week]
  );
  return { week_start: week, ...rows[0] };
}
