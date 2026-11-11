// Abstracción de almacenamiento: solo API S3 (compatible MinIO / S3 / Azure Blob con endpoint S3).
// Sin SDKs de nube en el camino crítico: firma AWS SigV4 con Node estándar.

import crypto from 'node:crypto';

const endpoint = process.env.S3_ENDPOINT;
const bucket = process.env.S3_BUCKET;
const accessKey = process.env.S3_ACCESS_KEY;
const secretKey = process.env.S3_SECRET_KEY;
const region = 'us-east-1';

function hmac(key, data) {
  return crypto.createHmac('sha256', key).update(data).digest();
}

function sha256Hex(data) {
  return crypto.createHash('sha256').update(data).digest('hex');
}

function amzDate(date = new Date()) {
  return date.toISOString().replace(/[:-]|\.\d{3}/g, '');
}

export async function putObject(key, body, contentType = 'application/pdf') {
  const payloadHash = sha256Hex(body);
  const host = new URL(endpoint).host;
  const canonicalUri = `/${bucket}/${key}`;
  const canonicalHeaders =
    `host:${host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate()}\n`;
  const signedHeaders = 'host;x-amz-content-sha256;x-amz-date';
  const canonicalRequest = [
    'PUT', canonicalUri, '', canonicalHeaders, signedHeaders, payloadHash,
  ].join('\n');
  const scope = `${amzDate().slice(0, 8)}/${region}/s3/aws4_request`;
  const stringToSign = [
    'AWS4-HMAC-SHA256', amzDate(), scope, sha256Hex(canonicalRequest),
  ].join('\n');
  const signingKey = hmac(
    hmac(hmac(hmac(`AWS4${secretKey}`, amzDate().slice(0, 8)), region), 's3'),
    'aws4_request'
  );
  const signature = crypto.createHmac('sha256', signingKey).update(stringToSign).digest('hex');

  const authorization =
    `AWS4-HMAC-SHA256 Credential=${accessKey}/${scope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const res = await fetch(`${endpoint}${canonicalUri}`, {
    method: 'PUT',
    headers: {
      Authorization: authorization,
      'x-amz-content-sha256': payloadHash,
      'x-amz-date': amzDate(),
      'Content-Type': contentType,
    },
    body,
  });
  if (!res.ok) throw new Error(`S3 putObject failed: ${res.status} ${await res.text()}`);
  return { key, bucket };
}
