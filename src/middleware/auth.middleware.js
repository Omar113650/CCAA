import { createRemoteJWKSet, jwtVerify } from 'jose';
import prisma from '../utils/prisma.js';
import { sendUnauthorized } from '../utils/response.js';

let jwksInstance = null;
const getJWKS = () => {
  if (!jwksInstance) {
    const jwksUrl =
      process.env.SUPABASE_JWKS_URL ||
      `${process.env.SUPABASE_URL}/auth/v1/.well-known/jwks.json`;
    jwksInstance = createRemoteJWKSet(new URL(jwksUrl));
  }
  return jwksInstance;
};

export const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return sendUnauthorized(res, 'Missing or invalid Authorization header');
    }

    const token = authHeader.slice(7);

    let payload;
    try {
      const { payload: jwtPayload } = await jwtVerify(token, getJWKS(), {
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

    let user = await prisma.user.findUnique({
      where: { id: supabaseUserId },
    });

    if (!user) {
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

    req.user = user;
    next();
  } catch (error) {
    console.error('[Auth Middleware Error]', error);
    return sendUnauthorized(res, 'Authentication failed');
  }
};

export const optionalAuth = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    req.user = null;
    return next();
  }
  return authenticate(req, res, next);
};
