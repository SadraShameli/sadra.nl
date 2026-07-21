export class RetryPolicy {
    static get default(): RetryPolicy {
        return new RetryPolicy(3, 250);
    }

    private constructor(
        private readonly maxAttempts: number,
        private readonly baseDelayMs: number,
    ) {}

    async execute<T>(function_: () => Promise<T>): Promise<T> {
        let lastError: unknown;
        for (
            let attemptIndex = 0;
            attemptIndex < this.maxAttempts;
            attemptIndex++
        ) {
            try {
                return await function_();
            } catch (error) {
                lastError = error;
                const isLastAttempt = attemptIndex === this.maxAttempts - 1;
                if (isLastAttempt) break;
                await sleep(this.baseDelayMs * 2 ** attemptIndex);
            }
        }
        throw lastError;
    }
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
