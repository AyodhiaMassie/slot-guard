import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import type { Request, RequestHandler } from 'express';
import type { Pool } from 'pg';
import { ApiError } from './errors.js';
import type { Role, UserProfile } from './types.js';

export const safeUserColumns = 'id, name, email, role, specialty, description, created_at';
const tokenOptions = { issuer: 'slotguard', audience: 'slotguard-api' };
const dummyPasswordHash = bcrypt.hash('invalid-login-placeholder', 12);

export function assertRole(user: UserProfile, roles: readonly Role[]): void {
  if (!roles.includes(user.role)) {
    throw new ApiError(403, 'FORBIDDEN', 'Your role cannot perform this action.');
  }
}

export function assertOwnership(userId: number, ownerId: number): void {
  if (userId !== ownerId) {
    throw new ApiError(403, 'FORBIDDEN', 'You do not own this record.');
  }
}

export function currentUser(request: Request): UserProfile {
  if (!request.user) throw new ApiError(401, 'UNAUTHENTICATED', 'Authentication is required.');
  return request.user;
}

export function requireRole(...roles: Role[]): RequestHandler {
  return (request, _response, next) => {
    assertRole(currentUser(request), roles);
    next();
  };
}

export function authenticate(pool: Pool, secret: string): RequestHandler {
  return async (request, _response, next) => {
    const header = request.header('authorization');
    const match = header?.match(/^Bearer ([^\s]+)$/i);
    if (!match?.[1]) throw new ApiError(401, 'UNAUTHENTICATED', 'A valid Bearer token is required.');
    let subject: number;
    try {
      const payload = jwt.verify(match[1], secret, { ...tokenOptions, algorithms: ['HS256'] });
      if (typeof payload === 'string' || !payload.sub || !/^[1-9]\d*$/.test(payload.sub)
        || typeof payload.exp !== 'number') throw new Error('Invalid token claims');
      subject = Number(payload.sub);
      if (!Number.isSafeInteger(subject) || subject > 2147483647) throw new Error('Invalid subject');
    } catch {
      throw new ApiError(401, 'UNAUTHENTICATED', 'The token is invalid or expired.');
    }
    // Reload the identity so deleted users and current roles take effect on every request.
    const result = await pool.query<UserProfile>(`SELECT ${safeUserColumns} FROM users WHERE id = $1`, [subject]);
    if (!result.rows[0]) throw new ApiError(401, 'UNAUTHENTICATED', 'The token is invalid or expired.');
    request.user = result.rows[0];
    next();
  };
}

export async function login(pool: Pool, secret: string, email: string, password: string) {
  const result = await pool.query<UserProfile & { password_hash: string }>(
    `SELECT ${safeUserColumns}, password_hash FROM users WHERE email = $1`, [email],
  );
  const row = result.rows[0];
  const matches = await bcrypt.compare(password, row?.password_hash ?? await dummyPasswordHash);
  if (!row || !matches) throw new ApiError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect.');
  const { password_hash: _passwordHash, ...user } = row;
  const token = jwt.sign({}, secret, {
    ...tokenOptions,
    algorithm: 'HS256',
    subject: String(user.id),
    expiresIn: '1h',
  });
  return { token, expires_in: 3600, user };
}
