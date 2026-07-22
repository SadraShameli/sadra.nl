import 'server-only';

import type {
    CurrencyCode,
    DateRange,
    ISODate,
} from '~/lib/accounting/core/types';
import type { RateProvider } from '~/lib/accounting/rates/provider';

import { USD_CODE } from '~/lib/accounting/core/currency';
import { isoDateSchema } from '~/lib/accounting/core/date';

const ECB_BASE = 'https://data-api.ecb.europa.eu/service/data';
const USER_AGENT = 'sadranl-accounting-importer/0.1';

interface CachedCurrencyRange {
    end: ISODate;
    start: ISODate;
}

interface EcbProviderOptions {
    fetchImpl?: typeof fetch;
    timeoutMs?: number;
}

export class EcbRateProvider implements RateProvider {
    private readonly cachedRanges = new Map<
        CurrencyCode,
        CachedCurrencyRange[]
    >();
    private readonly fetchImpl: typeof fetch;
    private readonly ratesByCurrency = new Map<
        CurrencyCode,
        Map<ISODate, number>
    >();
    private readonly timeoutMs: number;

    constructor(options: EcbProviderOptions = {}) {
        this.fetchImpl = options.fetchImpl ?? fetch;
        this.timeoutMs = options.timeoutMs ?? 30_000;
    }

    private isCached(currency: CurrencyCode, range: DateRange): boolean {
        const ranges = this.cachedRanges.get(currency);
        if (!ranges) return false;
        return ranges.some((r) => r.start <= range.start && r.end >= range.end);
    }

    private recordCached(currency: CurrencyCode, range: DateRange): void {
        const existing = this.cachedRanges.get(currency) ?? [];
        existing.push({ end: range.end, start: range.start });
        this.cachedRanges.set(currency, existing);
    }

    async ensureCurrencyRange(
        currency: CurrencyCode,
        range: DateRange,
    ): Promise<void> {
        if (this.isCached(currency, range)) return;

        const url = new URL(`${ECB_BASE}/EXR/D.${currency}.EUR.SP00.A`);
        url.searchParams.set('startPeriod', range.start);
        url.searchParams.set('endPeriod', range.end);
        url.searchParams.set('format', 'csvdata');

        const controller = new AbortController();
        const timeout = setTimeout(
            () => controller.abort(new Error('ECB request timed out')),
            this.timeoutMs,
        );
        try {
            const resp = await this.fetchImpl(url, {
                headers: { 'User-Agent': USER_AGENT },
                signal: controller.signal,
            });
            if (!resp.ok) {
                throw new Error(
                    `ECB fetch failed: ${resp.status} ${resp.statusText}`,
                );
            }
            const csv = await resp.text();
            let sink = this.ratesByCurrency.get(currency);
            if (!sink) {
                sink = new Map<ISODate, number>();
                this.ratesByCurrency.set(currency, sink);
            }
            ingestEcbCsv(csv, sink);
            this.recordCached(currency, range);
        } finally {
            clearTimeout(timeout);
        }
    }

    async ensureRange(range: DateRange): Promise<void> {
        await this.ensureCurrencyRange(USD_CODE, range);
    }

    rate(options: {
        base: CurrencyCode;
        on: ISODate;
        quote: CurrencyCode;
    }): number {
        if (options.base !== 'EUR') {
            throw new Error(
                `EcbRateProvider only supports EUR as base, got ${options.base}`,
            );
        }
        const rates = this.ratesByCurrency.get(options.quote);
        if (!rates) {
            throw new Error(
                `No ECB rates loaded for currency ${options.quote}`,
            );
        }
        const exact = rates.get(options.on);
        if (exact !== undefined) return exact;
        const earlier = rates
            .keys()
            .filter((k) => k <= options.on)
            .toArray()
            .toSorted((a, b) => Number(a > b) - Number(a < b));
        const fallback = earlier.at(-1);
        if (fallback === undefined) {
            throw new Error(`No ECB rate available on or before ${options.on}`);
        }
        const value = rates.get(fallback);
        if (value === undefined) {
            throw new Error(`No ECB rate available on or before ${options.on}`);
        }
        return value;
    }
}

function ingestEcbCsv(csv: string, sink: Map<ISODate, number>): void {
    const lines = csv.split(/\r?\n/);
    if (lines.length < 2) return;
    const headerLine = lines[0];
    if (!headerLine) return;
    const headers = parseCsvLine(headerLine);
    const timeIndex = headers.indexOf('TIME_PERIOD');
    const valueIndex = headers.indexOf('OBS_VALUE');
    if (timeIndex === -1 || valueIndex === -1) return;
    for (let index = 1; index < lines.length; index++) {
        const line = lines[index];
        if (!line) continue;
        const cells = parseCsvLine(line);
        const d = cells[timeIndex];
        const v = cells[valueIndex];
        if (!d || !v) continue;
        const parsedDate = isoDateSchema.safeParse(d);
        if (!parsedDate.success) continue;
        const n = Number(v);
        if (Number.isFinite(n)) sink.set(parsedDate.data, n);
    }
}

function parseCsvLine(line: string): string[] {
    const out: string[] = [];
    let current = '';
    let isInQuote = false;
    for (let index = 0; index < line.length; index++) {
        const ch = line[index] ?? '';
        if (isInQuote) {
            if (ch === '"' && line[index + 1] === '"') {
                current += '"';
                index++;
            } else if (ch === '"') {
                isInQuote = false;
            } else {
                current += ch;
            }
        } else if (ch === '"') {
            isInQuote = true;
        } else if (ch === ',') {
            out.push(current);
            current = '';
        } else {
            current += ch;
        }
    }
    out.push(current);
    return out;
}
