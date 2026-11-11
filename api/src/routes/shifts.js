import { Router } from 'express';
import { ensureEmployee, clockIn, clockOut, getOpenShift, getWeekSummary } from '../db.js';

const router = Router();

function weekStart(date = new Date()) {
  const d = new Date(date);
  const day = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - day);
  return d.toISOString().slice(0, 10);
}

router.post('/clock', async (req, res, next) => {
  try {
    const employee = await ensureEmployee(req.user);
    const action = req.body?.action === 'clock_out' ? 'clock_out' : 'clock_in';
    const source = req.body?.source === 'web' ? 'web' : 'teams';
    const result = action === 'clock_in'
      ? await clockIn(employee, source)
      : await clockOut(employee, source);
    res.json(result);
  } catch (err) { next(err); }
});

router.get('/me/shift', async (req, res, next) => {
  try {
    const employee = await ensureEmployee(req.user);
    const open = await getOpenShift(employee.id);
    res.json({ employee: { name: employee.display_name }, open_shift: open });
  } catch (err) { next(err); }
});

router.get('/me/week', async (req, res, next) => {
  try {
    const employee = await ensureEmployee(req.user);
    const week = req.query.week ? String(req.query.week) : weekStart();
    res.json(await getWeekSummary(employee.id, week));
  } catch (err) { next(err); }
});

export default router;
