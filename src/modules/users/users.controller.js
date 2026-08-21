import prisma from '../../utils/prisma.js';
import supabase from '../../config/supabase.js';
import {
  sendSuccess,
  sendCreated,
  sendNotFound,
  sendBadRequest,
} from '../../utils/response.js';
import {
  updateUserSchema,
  registerUserSchema,
  loginUserSchema,
  validate,
} from '../../utils/validators.js';

export const getMe = async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      include: {
        _count: {
          select: {
            projects: true,
            listings: true,
          },
        },
      },
    });

    if (!user) return sendNotFound(res, 'User not found');

    return sendSuccess(res, user, 'Profile fetched');
  } catch (err) {
    next(err);
  }
};

export const updateMe = async (req, res, next) => {
  try {
    const { success, data, errors } = validate(updateUserSchema, req.body);
    if (!success) return sendBadRequest(res, 'Validation failed', errors);

    const user = await prisma.user.update({
      where: { id: req.user.id },
      data,
    });

    return sendSuccess(res, user, 'Profile updated');
  } catch (err) {
    next(err);
  }
};

export const register = async (req, res, next) => {
  try {
    const { success, data, errors } = validate(registerUserSchema, req.body);
    if (!success) return sendBadRequest(res, 'Validation failed', errors);

    const { email, password, name, role, company, location } = data;

    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          name,
          role,
          company,
          location,
        },
      },
    });

    if (authError) {
      return sendBadRequest(res, authError.message);
    }

    const supabaseUser = authData.user;
    if (!supabaseUser) {
      return sendBadRequest(res, 'Registration failed to create Supabase user');
    }

    const user = await prisma.user.create({
      data: {
        id: supabaseUser.id,
        email: supabaseUser.email,
        name,
        role: role || null,
        company: company || null,
        location: location || null,
      },
    });

    return sendCreated(
      res,
      {
        user,
        session: authData.session,
      },
      'User registered successfully. Please verify your email if required.'
    );
  } catch (err) {
    next(err);
  }
};

export const login = async (req, res, next) => {
  try {
    const { success, data, errors } = validate(loginUserSchema, req.body);
    if (!success) return sendBadRequest(res, 'Validation failed', errors);

    const { email, password } = data;

    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (authError) {
      return sendBadRequest(res, authError.message);
    }

    const supabaseUser = authData.user;

    let user = await prisma.user.findUnique({
      where: { id: supabaseUser.id },
    });

    if (!user) {
      user = await prisma.user.create({
        data: {
          id: supabaseUser.id,
          email: supabaseUser.email,
          name: supabaseUser.user_metadata?.name || email.split('@')[0],
          role: supabaseUser.user_metadata?.role || null,
          company: supabaseUser.user_metadata?.company || null,
          location: supabaseUser.user_metadata?.location || null,
        },
      });
    }

    return sendSuccess(
      res,
      {
        user,
        session: {
          access_token: authData.session.access_token,
          refresh_token: authData.session.refresh_token,
          expires_in: authData.session.expires_in,
          token_type: authData.session.token_type,
        },
      },
      'Login successful'
    );
  } catch (err) {
    next(err);
  }
};
