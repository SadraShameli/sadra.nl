import 'server-only';

import type { DateRange, ISODate } from '../core/types';
import type { RateProvider } from './provider';

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
    private readonly cachedRanges = new Map<string, CachedCurrencyRange[]>();
    private readonly fetchImpl: typeof fetch;
    private readonly ratesByCurrency = new Map<string, Map<ISODate, number>>();
    private readonly timeoutMs: number;

    constructor(opts: EcbProviderOptions = {}) {
        this.fetchImpl = opts.fetchImpl ?? fetch;
        this.timeoutMs = opts.timeoutMs ?? 30_000;
    }

    async ensureCurrencyRange(
        currency: string,
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
        await this.ensureCurrencyRange('USD', range);
    }

    rate(opts: { base: string; on: ISODate; quote: string }): number {
        if (opts.base !== 'EUR') {
            throw new Error(
                `EcbRateProvider only supports EUR as base, got ${opts.base}`,
            );
        }
        const rates = this.ratesByCurrency.get(opts.quote);
        if (!rates) {
            throw new Error(`No ECB rates loaded for currency ${opts.quote}`);
        }
        const exact = rates.get(opts.on);
        if (exact !== undefined) return exact;
        const earlier = [...rates.keys()]
            .filter((k) => k <= opts.on)
            .toSorted();
        const fallback = earlier.at(-1);
        if (fallback === undefined) {
            throw new Error(`No ECB rate available on or before ${opts.on}`);
        }
        const value = rates.get(fallback);
        if (value === undefined) {
            throw new Error(`No ECB rate available on or before ${opts.on}`);
        }
        return value;
    }

    private isCached(currency: string, range: DateRange): boolean {
        const ranges = this.cachedRanges.get(currency);
        if (!ranges) return false;
        return ranges.some((r) => r.start <= range.start && r.end >= range.end);
    }

    private recordCached(currency: string, range: DateRange): void {
        const existing = this.cachedRanges.get(currency) ?? [];
        existing.push({ end: range.end, start: range.start });
        this.cachedRanges.set(currency, existing);
    }
}

function ingestEcbCsv(csv: string, sink: Map<ISODate, number>): void {
    const lines = csv.split(/\r?\n/);
    if (lines.length < 2) return;
    const headerLine = lines[0];
    if (!headerLine) return;
    const headers = parseCsvLine(headerLine);
    const timeIdx = headers.indexOf('TIME_PERIOD');
    const valueIdx = headers.indexOf('OBS_VALUE');
    if (timeIdx === -1 || valueIdx === -1) return;
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i];
        if (!line) continue;
        const cells = parseCsvLine(line);
        const d = cells[timeIdx];
        const v = cells[valueIdx];
        if (!d || !v) continue;
        const n = Number.parseFloat(v);
        if (Number.isFinite(n)) sink.set(d, n);
    }
}

function parseCsvLine(line: string): string[] {
    const out: string[] = [];
    let cur = '';
    let inQuote = false;
    for (let i = 0; i < line.length; i++) {
        const ch = line[i] ?? '';
        if (inQuote) {
            if (ch === '"' && line[i + 1] === '"') {
                cur += '"';
                i++;
            } else if (ch === '"') {
                inQuote = false;
            } else {
                cur += ch;
            }
        } else if (ch === '"') {
            inQuote = true;
        } else if (ch === ',') {
            out.push(cur);
            cur = '';
        } else {
            cur += ch;
        }
    }
    out.push(cur);
    return out;
}
