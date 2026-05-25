import 'server-only';

import type { DateRange, ISODate } from '../core/types';
import type { RateProvider } from './provider';

const ECB_BASE = 'https://data-api.ecb.europa.eu/service/data';
const USER_AGENT = 'sadranl-accounting-importer/0.1';

interface EcbProviderOptions {
    fetchImpl?: typeof fetch;
    timeoutMs?: number;
}

export class EcbRateProvider implements RateProvider {
    private readonly fetchImpl: typeof fetch;
    private readonly rates = new Map<ISODate, number>();
    private readonly timeoutMs: number;

    constructor(opts: EcbProviderOptions = {}) {
        this.fetchImpl = opts.fetchImpl ?? fetch;
        this.timeoutMs = opts.timeoutMs ?? 30_000;
    }

    async ensureRange(range: DateRange): Promise<void> {
        const url = new URL(`${ECB_BASE}/EXR/D.USD.EUR.SP00.A`);
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
            ingestEcbCsv(csv, this.rates);
        } finally {
            clearTimeout(timeout);
        }
    }

    rate(opts: { base: string; on: ISODate; quote: string }): number {
        if (opts.base !== 'EUR' || opts.quote !== 'USD') {
            throw new Error(
                `EcbRateProvider only supports EUR→USD, got ${opts.base}→${opts.quote}`,
            );
        }
        const exact = this.rates.get(opts.on);
        if (exact !== undefined) return exact;
        const earlier = [...this.rates.keys()]
            .filter((k) => k <= opts.on)
            .toSorted();
        const fallback = earlier.at(-1);
        if (fallback === undefined) {
            throw new Error(`No ECB rate available on or before ${opts.on}`);
        }
        const value = this.rates.get(fallback);
        if (value === undefined) {
            throw new Error(`No ECB rate available on or before ${opts.on}`);
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
