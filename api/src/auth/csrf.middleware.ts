import { NextFunction, Request, Response } from 'express';
import { getWebOrigins } from '../config/env';

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function originOf(value?: string) {
  if (!value) return '';
  try {
    const u = new URL(value);
    return `${u.protocol}//${u.host}`;
  } catch {
    return '';
  }
}

function requestOriginOf(req: Request) {
  const forwardedHost = req.headers['x-forwarded-host'];
  const hostHeader =
    (typeof forwardedHost === 'string' ? forwardedHost.split(',')[0].trim() : '') ||
    (typeof req.headers.host === 'string' ? req.headers.host : '');
  if (!hostHeader) return '';
  const forwardedProto = req.headers['x-forwarded-proto'];
  const proto =
    (typeof forwardedProto === 'string' ? forwardedProto.split(',')[0].trim() : '') ||
    (req.protocol || (req.secure ? 'https' : 'http'));
  return originOf(`${proto}://${hostHeader}`);
}

export function csrfAllowed(
  method: string,
  originHeader: string | undefined,
  refererHeader: string | undefined,
  allowed: Set<string>,
  production: boolean,
  requestOrigin?: string,
) {
  if (!MUTATING.has(method.toUpperCase())) return true;
  const origin = originOf(originHeader);
  if (origin) return allowed.has(origin) || (!!requestOrigin && origin === requestOrigin);
  const referer = originOf(refererHeader);
  if (referer) return allowed.has(referer) || (!!requestOrigin && referer === requestOrigin);
  return !production;
}

export function csrfOriginCheck(req: Request, res: Response, next: NextFunction) {
  const allowed = new Set(getWebOrigins());
  const origin = typeof req.headers.origin === 'string' ? req.headers.origin : undefined;
  const referer = typeof req.headers.referer === 'string' ? req.headers.referer : undefined;
  if (csrfAllowed(req.method, origin, referer, allowed, process.env.NODE_ENV === 'production', requestOriginOf(req))) {
    return next();
  }
  return res.status(403).json({ message: 'Forbidden' });
}
