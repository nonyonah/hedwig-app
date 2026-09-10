import { Request, Response, NextFunction, RequestHandler } from 'express';

/**
 * Express 4 does not forward async handler rejections to error middleware —
 * a bare `throw` becomes an unhandled rejection and kills the process
 * ([FATAL] Unhandled Rejection). Wrap every async route handler with this
 * so failures become proper error responses instead of crashes.
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>
): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}
