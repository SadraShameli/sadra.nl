const BENCH_SEPARATOR = ' · ';

export function benchCaption(definition: string, bench: null | string): string {
    return bench === null
        ? definition
        : `${definition}${BENCH_SEPARATOR}${bench}`;
}
