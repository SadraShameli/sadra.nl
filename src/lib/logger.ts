import 'server-only';

type Fields = Record<string, unknown>;

type Level = 'debug' | 'error' | 'info' | 'warn';

function emit(level: Level, message: string, fields?: Fields) {
    const payload = {
        level,
        message,
        timestamp: new Date().toISOString(),
        ...fields,
    };
    const line = JSON.stringify(payload);
    if (level === 'error') console.error(line);
    else if (level === 'warn') console.warn(line);
    else console.log(line);
}

export const logger = {
    debug: (message: string, fields?: Fields) => emit('debug', message, fields),
    error: (message: string, fields?: Fields) => emit('error', message, fields),
    info: (message: string, fields?: Fields) => emit('info', message, fields),
    warn: (message: string, fields?: Fields) => emit('warn', message, fields),
};

export function captureError(
    error: unknown,
    context?: { fields?: Fields; tag: string },
): void {
    const message = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : undefined;
    logger.error(`[${context?.tag ?? 'app'}] ${message}`, {
        ...context?.fields,
        stack,
    });
}
