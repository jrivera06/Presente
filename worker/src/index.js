// Timer worker: reglas por minuto (cierre automático de jornadas olvidadas),
// generación de registros semanales y preavisos programados.
import cron from 'node-cron';
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const timezone = process.env.TIMEZONE ?? 'UTC';
const maxShiftHours = Number(process.env.MAX_SHIFT_HOURS ?? 12);

function weekStart(date = new Date()) {
  const d = new Date(date);
  const day = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - day);
  return d.toISOString().slice(0, 10);
}

async function closeStaleShifts() {
  const { rows } = await pool.query(
    `UPDATE shifts
        SET ended_at = started_at + make_interval(hours => $1),
            minutes_worked = $1 * 60,
            status = 'closed'
      WHERE status = 'open'
        AND started_at < now() - make_interval(hours => $1)
      RETURNING id, employee_id`,
    [maxShiftHours]
  );
  if (rows.length) {
    console.log(`[worker] cerradas ${rows.length} jornadas abiertas de más de ${maxShiftHours}h`);
    for (const row of rows) {
      await pool.query(
        `INSERT INTO notifications (employee_id, kind, scheduled_for, payload)
         VALUES ($1, 'preaviso_cierre', now(), $2)`,
        [row.employee_id, JSON.stringify({ shift_id: row.id, reason: 'auto_close' })]
      );
    }
  }
}

async function generateWeeklyRecords() {
  const week = weekStart();
  const { rowCount } = await pool.query(
    `INSERT INTO weekly_records (employee_id, week_start, total_minutes, he_minutes, late_minutes, status)
     SELECT employee_id, week_start,
            COALESCE(SUM(minutes_worked), 0),
            COALESCE(SUM(he_minutes), 0),
            COALESCE(SUM(late_minutes), 0),
            'pending_signature'
       FROM shifts
      WHERE week_start = $1 AND status = 'closed'
      GROUP BY employee_id, week_start
      ON CONFLICT (employee_id, week_start) DO UPDATE
        SET total_minutes = EXCLUDED.total_minutes,
            he_minutes = EXCLUDED.he_minutes,
            late_minutes = EXCLUDED.late_minutes`,
    [week]
  );
  if (rowCount) console.log(`[worker] registros semanales actualizados: ${rowCount}`);
}

async function sendPendingNotifications() {
  const { rows } = await pool.query(
    `UPDATE notifications
        SET sent_at = now()
      WHERE sent_at IS NULL AND scheduled_for <= now()
      RETURNING id, employee_id, kind`
  );
  if (rows.length) {
    console.log(`[worker] notificaciones enviadas: ${rows.length}`);
    // Entrega real vía bot (proactive message) o correo: pendiente de integración.
  }
}

cron.schedule('* * * * *', () => {
  closeStaleShifts().catch((e) => console.error('[worker] closeStaleShifts', e));
  sendPendingNotifications().catch((e) => console.error('[worker] sendPendingNotifications', e));
});

cron.schedule('5 0 * * 1', () => {
  generateWeeklyRecords().catch((e) => console.error('[worker] generateWeeklyRecords', e));
}, { timezone });

console.log(`[worker] iniciado (tz=${timezone}, maxShiftHours=${maxShiftHours})`);
