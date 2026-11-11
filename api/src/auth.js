import jwt from 'jsonwebtoken';
import jwksRsa from 'jwks-rsa';

const tenantId = process.env.ENTRA_TENANT_ID;
const audience = process.env.ENTRA_AUDIENCE;
const issuer = `https://login.microsoftonline.com/${tenantId}/v2.0`;

const client = jwksRsa({
  jwksUri: `https://login.microsoftonline.com/${tenantId}/discovery/v2.0/keys`,
  cache: true,
  cacheMaxAge: 600000,
});

export async function requireAuth(req, res, next) {
  const header = req.headers.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'missing_token' });

  try {
    const decoded = jwt.decode(token, { complete: true });
    if (!decoded) return res.status(401).json({ error: 'invalid_token' });
    const key = await client.getSigningKey(decoded.header.kid);
    const payload = jwt.verify(token, key.getPublicKey(), {
      audience,
      issuer,
      algorithms: ['RS256'],
    });
    req.user = {
      oid: payload.oid,
      name: payload.name ?? payload.preferred_username,
      email: payload.preferred_username ?? payload.upn,
      tid: payload.tid,
    };
    next();
  } catch (err) {
    return res.status(401).json({ error: 'invalid_token', detail: err.message });
  }
}
