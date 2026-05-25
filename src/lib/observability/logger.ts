import 'server-only';
import * as Sentry from '@sentry/nextjs';
import pino, { type Logger as PinoLogger } from 'pino';

interface CaptureContext {
    fields?: Fields;
    tag: string;
}

type Fields = Record<string, unknown>;

type Level = 'debug' | 'error' | 'fatal' | 'info' | 'trace' | 'warn';

class AppLogger {
    private readonly pino: PinoLogger;

    constructor(pinoLogger?: PinoLogger) {
        this.pino = pinoLogger ?? AppLogger.buildBase();
    }

    private static buildBase(): PinoLogger {
        const isDev = process.env.NODE_ENV !== 'production';
        const level = process.env.LOG_LEVEL ?? (isDev ? 'debug' : 'info');

        return pino({
            base: undefined,
            formatters: {
                level: (label) => ({ level: label }),
            },
            level,
            timestamp: pino.stdTimeFunctions.isoTime,
            ...(isDev && {
                transport: {
                    options: {
                        colorize: true,
                        ignore: 'pid,hostname',
                        translateTime: 'HH:MM:ss.l',
                    },
                    target: 'pino-pretty',
                },
            }),
        });
    }

    child(bindings: Fields): AppLogger {
        return new AppLogger(this.pino.child(bindings));
    }

    debug(message: string, fields?: Fields): void {
        this.pino.debug(fields ?? {}, message);
    }

    error(message: string, fields?: Fields): void {
        this.pino.error(fields ?? {}, message);
    }

    fatal(message: string, fields?: Fields): void {
        this.pino.fatal(fields ?? {}, message);
    }

    info(message: string, fields?: Fields): void {
        this.pino.info(fields ?? {}, message);
    }

    warn(message: string, fields?: Fields): void {
        this.pino.warn(fields ?? {}, message);
    }
}

export const logger = new AppLogger();

interface SerializedError {
    cause?: SerializedError;
    message: string;
    name: string;
    stack?: string;
}

const MAX_CAUSE_DEPTH = 4;

export function captureError(error: unknown, context?: CaptureContext): void {
    const tag = context?.tag ?? 'app';
    const fields = context?.fields ?? {};
    const headline = deepestMessage(error);

    logger.error(`[${tag}] ${headline}`, {
        ...fields,
        err: serializeError(error),
    });

    if (error instanceof Error) {
        Sentry.captureException(error, {
            extra: fields,
            tags: { tag },
        });
    } else {
        Sentry.captureMessage(headline, {
            extra: fields,
            level: 'error',
            tags: { tag },
        });
    }
}

function deepestMessage(error: unknown): string {
    if (!(error instanceof Error)) return String(error);
    let cursor: unknown = error;
    let last: string = error.message;
    let depth = 0;
    while (
        cursor instanceof Error &&
        cursor.cause !== undefined &&
        cursor.cause !== null &&
        depth < MAX_CAUSE_DEPTH
    ) {
        cursor = cursor.cause;
        if (cursor instanceof Error && cursor.message) last = cursor.message;
        depth += 1;
    }
    return last;
}

function serializeError(
    error: unknown,
    depth = 0,
): SerializedError | { value: string } {
    if (!(error instanceof Error)) return { value: String(error) };
    const serialized: SerializedError = {
        message: error.message,
        name: error.name,
        stack: error.stack,
    };
    if (
        depth < MAX_CAUSE_DEPTH &&
        error.cause !== undefined &&
        error.cause !== null
    ) {
        const causeSerialized = serializeError(error.cause, depth + 1);
        if ('message' in causeSerialized) serialized.cause = causeSerialized;
    }
    return serialized;
}

export type { Fields, Level };
