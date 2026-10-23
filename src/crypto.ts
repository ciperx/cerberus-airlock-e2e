import { createHmac, timingSafeEqual } from 'node:crypto';

/** Constant-time comparison of two hex/base64url strings. */
export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a, 'utf8');
  const right = Buffer.from(b, 'utf8');
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function hmacHex(secret: string, message: string): string {
  return createHmac('sha256', secret).update(message, 'utf8').digest('hex');
}

export function hmacBase64Url(secret: string, message: string): string {
  return createHmac('sha256', secret).update(message, 'utf8').digest('base64url');
}

export function b64urlEncode(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64url');
}

export function b64urlDecode(value: string): string {
  return Buffer.from(value, 'base64url').toString('utf8');
}

/** Stable hash of the intent triple, used to bind a session to one request. */
export function intentHash(action: string, resource: string, requestedAtMs: number): string {
  return createHmac('sha256', 'cerberus.intent.v1')
    .update(`${action}|${resource}|${requestedAtMs}`, 'utf8')
    .digest('hex');
}
