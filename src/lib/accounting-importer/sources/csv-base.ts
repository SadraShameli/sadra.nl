import Papa from 'papaparse';

export function csvHeadersInclude(
    headers: readonly string[],
    required: readonly string[],
): boolean {
    const set = new Set(headers);
    return required.every((r) => set.has(r));
}

export function parseCsv<TRow>(text: string): TRow[] {
    const result = Papa.parse<TRow>(text, {
        dynamicTyping: false,
        header: true,
        skipEmptyLines: true,
        transformHeader: (h) => h.trim(),
    });
    const first = result.errors[0];
    if (first) {
        throw new Error(
            `CSV parse error (row ${first.row ?? '?'}): ${first.message}`,
        );
    }
    return result.data;
}

export function sniffCsvHeaders(text: string): string[] {
    const result = Papa.parse<string[]>(text, {
        header: false,
        preview: 1,
        skipEmptyLines: true,
    });
    const first = result.data[0] ?? [];
    return first.map((h) => h.trim());
}

export function toFloat(value: null | string | undefined): number {
    if (!value) return 0;
    const cleaned = value.replaceAll('$', '').replaceAll(',', '').trim();
    if (!cleaned) return 0;
    const n = Number.parseFloat(cleaned);
    return Number.isFinite(n) ? n : 0;
}
