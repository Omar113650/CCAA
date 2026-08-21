/**
 * Centralized API response helpers
 * Ensures consistent response format across all endpoints
 */

export const sendSuccess = (res, data = null, message = 'Success', statusCode = 200) => {
  return res.status(statusCode).json({
    success: true,
    message,
    data,
  });
};

export const sendCreated = (res, data = null, message = 'Created successfully') => {
  return sendSuccess(res, data, message, 201);
};

export const sendError = (res, message = 'Something went wrong', statusCode = 500, errors = null) => {
  const response = {
    success: false,
    message,
  };
  if (errors) response.errors = errors;
  return res.status(statusCode).json(response);
};

export const sendNotFound = (res, message = 'Resource not found') => {
  return sendError(res, message, 404);
};

export const sendUnauthorized = (res, message = 'Unauthorized') => {
  return sendError(res, message, 401);
};

export const sendForbidden = (res, message = 'Forbidden') => {
  return sendError(res, message, 403);
};

export const sendBadRequest = (res, message = 'Bad request', errors = null) => {
  return sendError(res, message, 400, errors);
};
