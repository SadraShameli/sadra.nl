export function joinWithAnd(parts: readonly string[]): string {
    const last = parts.at(-1) ?? '';
    return parts.length < 2
        ? last
        : `${parts.slice(0, -1).join(', ')} and ${last}`;
}
