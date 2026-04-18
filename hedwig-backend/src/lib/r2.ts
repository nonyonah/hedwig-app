import crypto from 'crypto';

const R2_ACCOUNT_ID  = process.env.R2_ACCOUNT_ID  || '';
const R2_ACCESS_KEY  = process.env.R2_ACCESS_KEY_ID || '';
const R2_SECRET_KEY  = process.env.R2_SECRET_ACCESS_KEY || '';
const R2_BUCKET      = process.env.R2_BUCKET_NAME  || 'hedwig-documents';
const R2_PUBLIC_URL  = (process.env.R2_PUBLIC_URL  || '').replace(/\/$/, '');

const R2_ENDPOINT = R2_ACCOUNT_ID
  ? `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`
  : '';

function isConfigured(): boolean {
  return Boolean(R2_ACCOUNT_ID && R2_ACCESS_KEY && R2_SECRET_KEY);
}

// AWS Signature v4 helpers
function hmac(key: Buffer | string, data: string): Buffer {
  return crypto.createHmac('sha256', key).update(data).digest();
}

function sign(key: Buffer, data: string): Buffer {
  return hmac(key, data);
}

function hexHash(data: Buffer | string): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}

function getSigningKey(secretKey: string, date: string, region: string, service: string): Buffer {
  const kDate    = sign(Buffer.from(`AWS4${secretKey}`, 'utf8'), date);
  const kRegion  = sign(kDate, region);
  const kService = sign(kRegion, service);
  return sign(kService, 'aws4_request');
}

interface SignedRequestOptions {
  method: string;
  key: string;
  body?: Buffer;
  contentType?: string;
  expires?: number; // seconds, for presigned URLs
}

function buildAuthHeaders(opts: SignedRequestOptions): Record<string, string> {
  const { method, key, body, contentType } = opts;
  const now    = new Date();
  const date   = now.toISOString().slice(0, 10).replace(/-/g, '');
  const time   = now.toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z';
  const region = 'auto';
  const service = 's3';

  const url        = `${R2_ENDPOINT}/${R2_BUCKET}/${key}`;
  const host       = new URL(url).host;
  const bodyHash   = body ? hexHash(body) : hexHash('');

  const headers: Record<string, string> = {
    host,
    'x-amz-date':           time,
    'x-amz-content-sha256': bodyHash,
  };
  if (contentType) headers['content-type'] = contentType;

  const signedHeaders = Object.keys(headers).sort().join(';');
  const canonicalHeaders = Object.keys(headers).sort()
    .map((k) => `${k}:${headers[k]}\n`).join('');

  const encodedKey = key.split('/').map(encodeURIComponent).join('/');

  const canonicalRequest = [
    method,
    `/${R2_BUCKET}/${encodedKey}`,
    '',
    canonicalHeaders,
    signedHeaders,
    bodyHash,
  ].join('\n');

  const credentialScope = `${date}/${region}/${service}/aws4_request`;
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    time,
    credentialScope,
    hexHash(canonicalRequest),
  ].join('\n');

  const signingKey = getSigningKey(R2_SECRET_KEY, date, region, service);
  const signature  = sign(signingKey, stringToSign).toString('hex');

  const authorization = [
    `AWS4-HMAC-SHA256 Credential=${R2_ACCESS_KEY}/${credentialScope}`,
    `SignedHeaders=${signedHeaders}`,
    `Signature=${signature}`,
  ].join(', ');

  return { ...headers, Authorization: authorization };
}

export interface R2UploadResult {
  key: string;
  url: string;
}

export async function uploadToR2(
  key: string,
  body: Buffer,
  contentType: string
): Promise<R2UploadResult> {
  if (!isConfigured()) {
    throw new Error('R2 is not configured. Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY.');
  }

  const headers = buildAuthHeaders({ method: 'PUT', key, body, contentType });
  const url     = `${R2_ENDPOINT}/${R2_BUCKET}/${key}`;

  const resp = await fetch(url, {
    method: 'PUT',
    headers: { ...headers, 'Content-Length': String(body.length) },
    body,
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`R2 upload failed (${resp.status}): ${text}`);
  }

  const publicUrl = R2_PUBLIC_URL ? `${R2_PUBLIC_URL}/${key}` : url;
  return { key, url: publicUrl };
}

export async function deleteFromR2(key: string): Promise<void> {
  if (!isConfigured()) return;

  const headers = buildAuthHeaders({ method: 'DELETE', key });
  const url     = `${R2_ENDPOINT}/${R2_BUCKET}/${key}`;

  await fetch(url, { method: 'DELETE', headers });
}

export async function getFromR2(key: string): Promise<Buffer | null> {
  if (!isConfigured()) return null;

  const headers = buildAuthHeaders({ method: 'GET', key });
  const url     = `${R2_ENDPOINT}/${R2_BUCKET}/${key}`;

  const resp = await fetch(url, { method: 'GET', headers });
  if (!resp.ok) return null;

  return Buffer.from(await resp.arrayBuffer());
}

export function r2PublicUrl(key: string): string {
  if (R2_PUBLIC_URL) return `${R2_PUBLIC_URL}/${key}`;
  return `${R2_ENDPOINT}/${R2_BUCKET}/${key}`;
}

export { isConfigured as r2IsConfigured };
