export function assertPositiveSafeInteger(value: number, name: string): void {
    if (!Number.isSafeInteger(value) || value <= 0) {
        throw new Error(
            `${name} must be a positive safe integer, got ${value}`,
        );
    }
}
