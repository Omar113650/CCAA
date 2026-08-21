/**
 * Centralized Error Handler Middleware
 * Must be registered LAST in Express (after all routes)
 */
export const errorHandler = (err, req, res, next) => {
  console.error('[Error Handler]', {
    message: err.message,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
    url: req.url,
    method: req.method,
  });

  // Prisma errors
  if (err.code === 'P2002') {
    return res.status(409).json({
      success: false,
      message: 'A record with this data already exists',
      field: err.meta?.target,
    });
  }

  if (err.code === 'P2025') {
    return res.status(404).json({
      success: false,
      message: 'Record not found',
    });
  }

  if (err.code === 'P2003') {
    return res.status(400).json({
      success: false,
      message: 'Related record not found',
    });
  }

  // Default error
  const statusCode = err.statusCode || err.status || 500;
  const message =
    process.env.NODE_ENV === 'production' && statusCode === 500
      ? 'Internal server error'
      : err.message || 'Something went wrong';

  return res.status(statusCode).json({
    success: false,
    message,
  });
};

/**
 * 404 Not Found handler
 * Catches any request that didn't match a route
 */
export const notFoundHandler = (req, res) => {
  return res.status(404).json({
    success: false,
    message: `Route ${req.method} ${req.url} not found`,
  });
};
