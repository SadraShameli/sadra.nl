import 'server-only';

import './providers/index';
import './sources/index';
import type {
    DecryptedCredential,
    ImportEvent,
    PlanInput,
    PushInput,
} from './runner-types';

import { buildBookings, collectDates } from './core/orchestrator';
import {
    type ConversionResult,
    dateRangeFromList,
    type ISODate,
    type RawTransaction,
} from './core/types';
import { getCredentialDescriptor } from './credentials/index';
import { getProvider } from './providers/provider';
import { EcbRateProvider } from './rates/ecb';
import { findApiSourceByCredentialKind, getSource } from './sources/source';

export type {
    DecryptedCredential,
    ImportEvent,
    PlanInput,
    PushInput,
} from './runner-types';

const todayIso = (): ISODate => new Date().toISOString().slice(0, 10);

export async function* runPlan(input: PlanInput): AsyncIterable<ImportEvent> {
    const sourcesStart = Date.now();
    yield { kind: 'stage', stage: 'sources', status: 'started' };
    const all: RawTransaction[] = [...input.uploadedTransactions];
    yield {
        kind: 'log',
        level: 'info',
        message: `Loaded ${input.uploadedTransactions.length} transaction(s) from uploaded CSVs.`,
    };

    for (const credential of input.apiCredentials) {
        for await (const event of fetchFromApiCredential(
            credential,
            input.startDate,
            input.fetchImpl,
        )) {
            if (event.kind === 'data') all.push(...event.txns);
            else yield event;
        }
    }

    yield {
        durationMs: Date.now() - sourcesStart,
        kind: 'stage',
        message: `Total transactions: ${all.length}`,
        stage: 'sources',
        status: 'finished',
    };

    if (all.length === 0) {
        yield {
            kind: 'log',
            level: 'warn',
            message:
                'No transactions found. Upload CSVs or enable an API source.',
        };
        yield { kind: 'preview', result: emptyResult() };
        yield { kind: 'done' };
        return;
    }
    const datesForFx = collectDates(all, input.startDate, input.rules);
    const range = dateRangeFromList(datesForFx);
    const rates = new EcbRateProvider({ fetchImpl: input.fetchImpl });
    if (range) {
        const fxStart = Date.now();
        yield {
            kind: 'stage',
            message: `Fetching ECB rates ${range.start} → ${range.end}`,
            stage: 'fetch-fx',
            status: 'started',
        };
        try {
            await rates.ensureRange(range);
            yield {
                durationMs: Date.now() - fxStart,
                kind: 'stage',
                stage: 'fetch-fx',
                status: 'finished',
            };
        } catch (error) {
            const message =
                error instanceof Error ? error.message : String(error);
            yield {
                kind: 'log',
                level: 'error',
                message: `ECB rate fetch failed: ${message}`,
            };
            yield { kind: 'done' };
            return;
        }
    } else {
        yield {
            kind: 'log',
            level: 'info',
            message: 'No bookable transactions in range; skipping FX fetch.',
        };
    }
    const buildStart = Date.now();
    yield { kind: 'stage', stage: 'build', status: 'started' };
    const bankByCurrency = new Map(
        input.bankAccounts.map((b) => [b.currency, b.ledger]),
    );
    const result = buildBookings({
        bankByCurrency,
        rates,
        rules: input.rules,
        start: input.startDate,
        transactions: all,
    });
    if (result.missingBankCurrencies.length > 0) {
        yield {
            kind: 'log',
            level: 'warn',
            message: `Skipped ${result.skippedNoBank} transaction(s): no bank account configured for ${result.missingBankCurrencies.join(', ')}. Add it under Booking rules.`,
        };
    }
    yield {
        durationMs: Date.now() - buildStart,
        kind: 'stage',
        message: `${result.bookings.length} booking(s), ${result.unknowns.length} unknown counterpart(s), ${result.skippedCurrency} skipped.`,
        stage: 'build',
        status: 'finished',
    };
    yield { kind: 'preview', result };
    yield { kind: 'done' };
}

export async function* runPush(input: PushInput): AsyncIterable<ImportEvent> {
    if (input.bookings.length === 0) {
        yield {
            kind: 'log',
            level: 'warn',
            message: 'No bookings to post.',
        };
        yield { kind: 'done' };
        return;
    }
    const descriptor = getCredentialDescriptor(input.accountingCredential.kind);
    if (!descriptor?.accountingProviderId) {
        yield {
            kind: 'log',
            level: 'error',
            message: `Credential kind "${input.accountingCredential.kind}" has no accounting provider attached.`,
        };
        yield { kind: 'done' };
        return;
    }
    const provider = getProvider(descriptor.accountingProviderId);
    if (!provider) {
        yield {
            kind: 'log',
            level: 'error',
            message: `Accounting provider "${descriptor.accountingProviderId}" not registered.`,
        };
        yield { kind: 'done' };
        return;
    }

    const postStart = Date.now();
    yield {
        kind: 'stage',
        message: `Posting ${input.bookings.length} mutation(s) to ${descriptor.label}…`,
        stage: 'post',
        status: 'started',
    };

    const session = await provider.openSession({
        fetchImpl: input.fetchImpl,
        meta: input.accountingCredential.meta,
        secret: input.accountingCredential.secret,
    });
    try {
        let done = 0;
        for (const booking of input.bookings) {
            try {
                const result = await session.postBooking(booking);
                yield {
                    externalId: result.externalId,
                    kind: 'posted',
                    txnId: booking.txnId,
                };
            } catch (error) {
                const message =
                    error instanceof Error ? error.message : String(error);
                yield { error: message, kind: 'failed', txnId: booking.txnId };
            }
            done += 1;
            yield {
                current: done,
                kind: 'progress',
                stage: 'post',
                total: input.bookings.length,
            };
        }
    } finally {
        await session.close().catch(swallow);
    }

    yield {
        durationMs: Date.now() - postStart,
        kind: 'stage',
        stage: 'post',
        status: 'finished',
    };
    yield { kind: 'done' };
}

function emptyResult(): ConversionResult {
    return {
        bookings: [],
        matches: [],
        missingBankCurrencies: [],
        skippedCurrency: 0,
        skippedNoBank: 0,
        unknowns: [],
    };
}

async function* fetchFromApiCredential(
    credential: DecryptedCredential,
    startDate: ISODate,
    fetchImpl?: typeof fetch,
): AsyncIterable<ImportEvent | { kind: 'data'; txns: RawTransaction[] }> {
    const descriptor = getCredentialDescriptor(credential.kind);
    const source = descriptor?.transactionSourceId
        ? getSource(descriptor.transactionSourceId)
        : findApiSourceByCredentialKind(credential.kind);
    if (source?.kind !== 'api') {
        yield {
            kind: 'log',
            level: 'warn',
            message: `No API source registered for credential kind "${credential.kind}"; skipping.`,
        };
        yield { kind: 'data', txns: [] };
        return;
    }
    const label = descriptor?.label ?? credential.kind;
    yield {
        kind: 'log',
        level: 'info',
        message: `Fetching ${label} transactions via API…`,
    };
    try {
        const txns = await source.fetch({
            fetchImpl,
            from: startDate,
            meta: credential.meta,
            secret: credential.secret,
            to: todayIso(),
        });
        yield {
            kind: 'log',
            level: 'info',
            message: `${label} API returned ${txns.length} transaction(s).`,
        };
        yield { kind: 'data', txns };
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        yield {
            kind: 'log',
            level: 'error',
            message: `${label} API fetch failed: ${message}`,
        };
        yield { kind: 'data', txns: [] };
    }
}

function swallow(): void {
    return undefined;
}
