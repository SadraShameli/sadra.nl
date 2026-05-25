const DAY_MS = 86_400_000;

export function endOfDayExclusive(date: Date): Date {
    return new Date(date.getTime() + DAY_MS);
}

export function isMidnight(date: Date): boolean {
    return (
        date.getUTCHours() === 0 &&
        date.getUTCMinutes() === 0 &&
        date.getUTCSeconds() === 0 &&
        date.getUTCMilliseconds() === 0
    );
}

export function rangeEnd(to: Date): Date {
    return isMidnight(to) ? endOfDayExclusive(to) : to;
}
