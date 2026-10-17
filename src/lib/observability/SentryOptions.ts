const PRODUCTION_TRACE_SAMPLE_RATE = 0.1;
const LOCAL_TRACE_SAMPLE_RATE = 1;

export interface SentryBaseOptions {
    readonly environment: string | undefined;
    readonly tracesSampleRate: number;
}

export interface SentryRuntime {
    readonly nodeEnvironment: string | undefined;
    readonly vercelEnvironment: string | undefined;
}

export function sentryBaseOptions(runtime: SentryRuntime): SentryBaseOptions {
    return {
        environment: runtime.vercelEnvironment ?? runtime.nodeEnvironment,
        tracesSampleRate:
            runtime.nodeEnvironment === 'production'
                ? PRODUCTION_TRACE_SAMPLE_RATE
                : LOCAL_TRACE_SAMPLE_RATE,
    };
}
