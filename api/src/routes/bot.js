// Endpoint del bot de Teams (canal Azure Bot Service -> /api/messages).
// Azure Bot Service solo enruta; el código y los datos quedan en este servidor.
// Stub funcional: valida el emisor del activity y responde a los comandos "entrada"/"salida".
// Para producción, reemplazar por Bot Framework SDK (botbuilder + CloudAdapter) con validación completa del token.

import { Router } from 'express';
import { pool, clockIn, clockOut } from '../db.js';

const router = Router();

function jwtDecode(token) {
  try {
    const [, payload] = token.split('.');
    return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}

// Validación mínima del token de Bot Framework (issuer + audience).
// La verificación de firma se delega a botbuilder en producción.
function validateBotToken(req) {
  const header = req.headers.authorization ?? '';
  if (!header.startsWith('Bearer ')) return null;
  const decoded = jwtDecode(header.slice(7));
  if (!decoded) return null;
  if (decoded.iss !== 'https://api.botframework.com') return null;
  if (decoded.aud !== process.env.BOT_APP_ID) return null;
  return decoded;
}

async function ensureEmployee({ oid, name, email }) {
  const { rows } = await pool.query(
    `INSERT INTO employees (entra_oid, display_name, email)
     VALUES ($1, $2, $3)
     ON CONFLICT (entra_oid) DO UPDATE SET display_name = EXCLUDED.display_name
     RETURNING *`,
    [oid, name ?? email ?? 'Desconocido', email ?? `${oid}@local`]
  );
  return rows[0];
}

router.post('/', async (req, res) => {
  if (!validateBotToken(req)) return res.status(401).json({ error: 'invalid_bot_token' });

  const activity = req.body;
  if (!activity || activity.type !== 'message') {
    return res.status(200).json({});
  }

  const text = String(activity.text ?? '').trim().toLowerCase();
  const oid = activity.from?.aadObjectId;
  const name = activity.from?.name;
  const email = activity.from?.properties?.email ?? '';

  let reply;
  if (!oid) {
    reply = 'No puedo identificar tu cuenta de Entra ID. Contacta a TI.';
  } else if (text.startsWith('entrada')) {
    const employee = await ensureEmployee({ oid, name, email });
    const { action, shift } = await clockIn(employee, 'teams');
    reply = action === 'already_in'
      ? `Ya tienes una jornada abierta desde ${new Date(shift.started_at).toLocaleTimeString()}.`
      : `Entrada registrada a las ${new Date(shift.started_at).toLocaleTimeString()}.`;
  } else if (text.startsWith('salida')) {
    const employee = await ensureEmployee({ oid, name, email });
    const { action, shift } = await clockOut(employee, 'teams');
    reply = action === 'not_in'
      ? 'No tienes ninguna jornada abierta.'
      : `Salida registrada. Jornada: ${shift.minutes_worked} min, retardo: ${shift.late_minutes} min.`;
  } else {
    reply = 'Comandos: "entrada" para checar entrada, "salida" para cerrar la jornada.';
  }

  res.status(200).json({
    type: 'message',
    from: { id: activity.recipient?.id, name: activity.recipient?.name },
    conversation: activity.conversation,
    recipient: activity.from,
    text: reply,
    replyToId: activity.id,
  });
});

export default router;
