import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { env } from '../config/env';

export class HttpError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export const errorHandler = (err: Error, _req: Request, res: Response, _next: NextFunction) => {
  // Production'da sadece hata mesajı logla, stack trace verme
  if (env.isProd) {
    console.error(`[ERROR] ${err.name}: ${err.message}`);
  } else {
    console.error(err);
  }

  if (err instanceof ZodError) {
    // Production'da validasyon detaylarını gizle
    return res.status(400).json({
      error: 'Validation failed',
      ...(env.isProd ? {} : { details: err.flatten() }),
    });
  }
  if (err instanceof HttpError) {
    // Production'da hassas hata mesajlarını gizle
    return res.status(err.status).json({
      error: env.isProd ? 'Request failed' : err.message,
    });
  }
  return res.status(500).json({ error: 'Internal Server Error' });
};
