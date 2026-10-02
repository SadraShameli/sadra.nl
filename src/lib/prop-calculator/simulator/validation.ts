export function assertNonNegativeSafeInteger(
    value: number,
    name: string,
): void {
    if (!Number.isSafeInteger(value) || value < 0) {
        throw new Error(
            `${name} must be a non-negative safe integer, got ${value}`,
        );
    }
}

export function assertPositiveFiniteNumber(value: number, name: string): void {
    if (!Number.isFinite(value) || value <= 0) {
        throw new Error(`${name} must be a positive finite number, got ${value}`);
    }
}

export function assertPositiveSafeInteger(value: number, name: string): void {
    if (!Number.isSafeInteger(value) || value <= 0) {
        throw new Error(
            `${name} must be a positive safe integer, got ${value}`,
        );
    }
}

export function assertProbability(value: number, name: string): void {
    if (!Number.isFinite(value) || value < 0 || value > 1) {
        throw new Error(`${name} must be a probability from 0 to 1, got ${value}`);
    }
}
