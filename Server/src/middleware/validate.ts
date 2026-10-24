import type { NextFunction, Request, Response } from 'express';
import type { ZodType, ZodTypeDef } from 'zod';

declare module 'express-serve-static-core' {
  interface Request {
    validatedBody?: unknown;
    validatedQuery?: unknown;
  }
}

export function validateBody<T>(schema: ZodType<T, ZodTypeDef, unknown>) {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      req.validatedBody = schema.parse(req.body ?? {});
      next();
    } catch (error) {
      next(error);
    }
  };
}

export function validateQuery<T>(schema: ZodType<T, ZodTypeDef, unknown>) {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      req.validatedQuery = schema.parse(req.query ?? {});
      next();
    } catch (error) {
      next(error);
    }
  };
}
