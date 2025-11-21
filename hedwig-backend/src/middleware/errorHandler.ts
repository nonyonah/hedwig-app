import { Request, Response, NextFunction } from 'express';

export class AppError extends Error {
    statusCode: number;
    isOperational: boolean;

    constructor(message: string, statusCode: number) {
        super(message);
        this.statusCode = statusCode;
        this.isOperational = true;

        Error.captureStackTrace(this, this.constructor);
    }
}

export const errorHandler = (
    err: AppError | Error,
    req: Request,
    res: Response,
    _next: NextFunction
) => {
    let statusCode = 500;
    let message = 'Internal Server Error';
    let isOperational = false;

    if (err instanceof AppError) {
        statusCode = err.statusCode;
        message = err.message;
        isOperational = err.isOperational;
    } else if (err instanceof Error) {
        message = err.message;
    }

    // Log error for internal tracking
    console.error('Error:', {
        message: err.message,
        stack: err.stack,
        statusCode,
        path: req.path,
        method: req.method,
        timestamp: new Date().toISOString(),
    });

    // Don't leak error details in production
    if (process.env.NODE_ENV === 'production' && !isOperational) {
        message = 'Something went wrong';
    }

    res.status(statusCode).json({
        success: false,
        error: {
            message,
            ...(process.env.NODE_ENV === 'development' && {
                stack: err.stack,
            }),
        },
    });
};
