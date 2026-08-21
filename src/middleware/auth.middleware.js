import { createRemoteJWKSet, jwtVerify } from 'jose';
import prisma from '../utils/prisma.js';
import { sendUnauthorized } from '../utils/response.js';

// Cache the JWKS so we don't fetch it on every request
const JWKS = createRemoteJWKSet(
  new URL(process.env.SUPABASE_JWKS_URL || `${process.env.SUPABASE_URL}/auth/v1/.well-known/jwks.json`)
);

/**
 * Auth Middleware
 * 1. Extracts Bearer token from Authorization header
 * 2. Verifies it with Supabase JWKS
 * 3. Finds or creates user in DB
 * 4. Attaches req.user for downstream handlers
 */
export const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return sendUnauthorized(res, 'Missing or invalid Authorization header');
    }

    const token = authHeader.slice(7);

    // Verify JWT with Supabase JWKS
    let payload;
    try {
      const { payload: jwtPayload } = await jwtVerify(token, JWKS, {
        issuer: `${process.env.SUPABASE_URL}/auth/v1`,
      });
      payload = jwtPayload;
    } catch (jwtError) {
      return sendUnauthorized(res, 'Invalid or expired token');
    }

    const supabaseUserId = payload.sub;
    const email = payload.email;

    if (!supabaseUserId || !email) {
      return sendUnauthorized(res, 'Token missing required claims');
    }

    // Find or create user in our DB (sync with Supabase Auth)
    let user = await prisma.user.findUnique({
      where: { id: supabaseUserId },
    });

    if (!user) {
      // First login — create user record from Supabase claims
      const name =
        payload.user_metadata?.full_name ||
        payload.user_metadata?.name ||
        email.split('@')[0];

      user = await prisma.user.create({
        data: {
          id: supabaseUserId,
          email,
          name,
          company: payload.user_metadata?.company || null,
          location: payload.user_metadata?.location || null,
          role: payload.user_metadata?.role || null,
        },
      });
    }

    // Attach user to request for downstream handlers
    req.user = user;
    next();
  } catch (error) {
    console.error('[Auth Middleware Error]', error);
    return sendUnauthorized(res, 'Authentication failed');
  }
};

/**
 * Optional auth — doesn't block if no token
 * Sets req.user = null if unauthenticated
 */
export const optionalAuth = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    req.user = null;
    return next();
  }
  return authenticate(req, res, next);
};
