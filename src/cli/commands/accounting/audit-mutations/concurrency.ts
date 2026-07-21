export async function mapWithConcurrency<T, R>(
    items: readonly T[],
    concurrency: number,
    function_: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
    const results: R[] = Array.from({ length: items.length });
    let cursor = 0;

    async function worker(): Promise<void> {
        for (;;) {
            const index = cursor;
            cursor += 1;
            if (index >= items.length) return;
            const item = items[index];
            if (item === undefined) return;
            results[index] = await function_(item, index);
        }
    }

    const workerCount = Math.max(1, Math.min(concurrency, items.length));
    const workers = Array.from({ length: workerCount }, () => worker());
    await Promise.all(workers);
    return results;
}

export async function paginate<T>(
    fetchPage: (offset: number) => Promise<T[]>,
    pageSize: number,
): Promise<T[]> {
    const results: T[] = [];
    let offset = 0;
    for (;;) {
        const page = await fetchPage(offset);
        results.push(...page);
        if (page.length < pageSize) break;
        offset += pageSize;
    }
    return results;
}
