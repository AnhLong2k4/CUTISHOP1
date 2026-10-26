import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import { ApiError } from '../utils/errors.js';

interface MongoLikeError {
  code?: number;
  keyPattern?: Record<string, unknown>;
}

/**
 * Central error handler. Known errors keep their semantic status
 * (auth failures are 4xx, never blanket 500s). Unknown errors are
 * logged server-side and returned as a generic 500 without internals.
 */
export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  if (error instanceof ApiError) {
    res.status(error.status).json({
      success: false,
      error: { code: error.code, message: error.message, details: error.details },
    });
    return;
  }

  if (error instanceof ZodError) {
    res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Dữ liệu không hợp lệ',
        details: error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      },
    });
    return;
  }

  const mongoError = error as MongoLikeError;
  if (mongoError && mongoError.code === 11000) {
    const field = mongoError.keyPattern
      ? Object.keys(mongoError.keyPattern).join(', ')
      : 'value';
    res.status(409).json({
      success: false,
      error: {
        code: 'DUPLICATE_KEY',
        message: `Giá trị đã tồn tại: ${field}`,
        details: { field },
      },
    });
    return;
  }

  if (error && typeof error === 'object' && 'name' in error && error.name === 'MulterError') {
    res.status(400).json({
      success: false,
      error: { code: 'UPLOAD_ERROR', message: 'Tải ảnh thất bại: file không hợp lệ' },
    });
    return;
  }

  console.error('Unhandled error:', error);
  res.status(500).json({
    success: false,
    error: { code: 'INTERNAL_ERROR', message: 'Đã xảy ra lỗi máy chủ' },
  });
};

export const notFoundHandler = (_req: import('express').Request, res: import('express').Response) => {
  res.status(404).json({
    success: false,
    error: { code: 'NOT_FOUND', message: 'Không tìm thấy tài nguyên' },
  });
};
