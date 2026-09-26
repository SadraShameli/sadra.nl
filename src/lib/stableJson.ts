export function stableJson(value: unknown): string {
    return JSON.stringify(value, (_key, nested: unknown) =>
        typeof nested === 'object' && nested !== null && !Array.isArray(nested)
            ? Object.fromEntries(
                  Object.entries(nested).toSorted(([a], [b]) =>
                      a < b ? -1 : Number(a > b),
                  ),
              )
            : nested,
    );
}
