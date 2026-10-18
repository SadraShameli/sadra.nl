const SUCCESS_EXIT_CODE = 0;

export type CapturedExitCode = number | string | undefined;

export function capturedExitCode(): CapturedExitCode {
    const code = process.exitCode;
    return code === SUCCESS_EXIT_CODE || code === null ? undefined : code;
}

export function resetExitCode(): void {
    process.exitCode = SUCCESS_EXIT_CODE;
}

export function restoreExitCode(previous: typeof process.exitCode): void {
    process.exitCode = previous ?? SUCCESS_EXIT_CODE;
}
