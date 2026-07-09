import 'server-only';

import '~/lib/accounting/providers/index';
import type {
    DecryptedCredential,
    FileInput,
    ImportEvent,
    PlanInput,
    PushInput,
} from '~/lib/accounting/runner-types';
import type { RunOutcome, RunSummary } from '~/lib/accounting/runs/types';

import { BookingAggregator } from '~/lib/accounting/core/aggregator';
import { IsoDate } from '~/lib/accounting/core/date';
import { type RunId, UserId } from '~/lib/accounting/core/ids';
import { CurrencyConverter, Eur } from '~/lib/accounting/core/money';
import { RetryPolicy } from '~/lib/accounting/core/retry-policy';
import {
    type ConversionResult,
    type ISODate,
    type RawTransaction,
} from '~/lib/accounting/core/types';
import { CredentialRegistry } from '~/lib/accounting/credentials/index';
import { ProviderRegistry } from '~/lib/accounting/providers/provider';
import { EcbRateProvider } from '~/lib/accounting/rates/ecb';
import { accountingRunRepository } from '~/lib/accounting/runs/repository';
import '~/lib/accounting/sources/index';
import { SourceRegistry } from '~/lib/accounting/sources/source';

export type {
    DecryptedCredential,
    ImportEvent,
    PlanInput,
    PushInput,
} from '~/lib/accounting/runner-types';

const todayIso = (): ISODate => IsoDate.today();

export async function* runPlan(input: PlanInput): AsyncIterable<ImportEvent> {
    const sourcesStart = Date.now();
    yield { kind: 'stage', stage: 'sources', status: 'started' };
    const all: RawTransaction[] = [];

    const fetches = await Promise.all(
        input.apiCredentials.map((credential) =>
            fetchFromApiCredential(
                credential,
                input.startDate,
                input.fetchImpl,
            ),
        ),
    );
    for (const { events, txns } of fetches) {
        for (const event of events) yield event;
        all.push(...txns);
    }

    for (const { events, txns } of input.fileInputs.map(parseFromFileInput)) {
        for (const event of events) yield event;
        all.push(...txns);
    }

    yield {
        durationMs: Date.now() - sourcesStart,
        kind: 'stage',
        message: `Total transactions: ${all.length}`,
        stage: 'sources',
        status: 'finished',
    };

    if (all.length === 0) {
        const result = emptyResult();
        yield {
            kind: 'log',
            level: 'warn',
            message: 'No transactions found.',
        };
        yield await persistRun(input, result);
        yield { kind: 'preview', result };
        yield { kind: 'done' };
        return;
    }

    const startDate = IsoDate.parse(input.startDate);
    const datesForFx = BookingAggregator.requiredDateRange(
        all,
        startDate,
        input.ruleSet,
    );
    const range = IsoDate.range(datesForFx);
    const rates = new EcbRateProvider({ fetchImpl: input.fetchImpl });
    const fxCurrencies = BookingAggregator.requiredCurrencies(
        all,
        startDate,
        input.ruleSet,
    );
    if (range && fxCurrencies.length > 0) {
        const fxStart = Date.now();
        yield {
            kind: 'stage',
            message: `Fetching ECB rates ${range.start} → ${range.end} for ${fxCurrencies.join(', ')}`,
            stage: 'fetch-fx',
            status: 'started',
        };
        try {
            await Promise.all(
                fxCurrencies.map((currency) =>
                    RetryPolicy.default().execute(() =>
                        rates.ensureCurrencyRange(currency, range),
                    ),
                ),
            );
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
    } else if (!range) {
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
    const aggregator = new BookingAggregator(
        input.ruleSet,
        new CurrencyConverter(rates),
        bankByCurrency,
        startDate,
    );
    for (const tx of all) aggregator.ingest(tx);
    const result = aggregator.result();
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
    yield await persistRun(input, result);
    yield { kind: 'preview', result };
    yield { kind: 'done' };
}

export async function* runPush(input: PushInput): AsyncIterable<ImportEvent> {
    const userId = UserId(input.userId);
    const run = await accountingRunRepository.get(input.runId, userId);
    if (!run) {
        yield {
            kind: 'log',
            level: 'error',
            message: `Run ${input.runId} not found.`,
        };
        yield { kind: 'done' };
        return;
    }

    const bookingsToPost = run.bookings.filter(
        (b) => run.outcomes[b.txnId]?.status !== 'posted',
    );
    if (bookingsToPost.length === 0) {
        yield {
            kind: 'log',
            level: 'warn',
            message: 'No bookings to post.',
        };
        yield { kind: 'done' };
        return;
    }

    const descriptor = CredentialRegistry.instance().get(
        input.accountingCredential.kind,
    );
    if (!descriptor?.accountingProviderId) {
        yield {
            kind: 'log',
            level: 'error',
            message: `Credential kind "${input.accountingCredential.kind}" has no accounting provider attached.`,
        };
        yield { kind: 'done' };
        return;
    }
    const provider = ProviderRegistry.instance().get(
        descriptor.accountingProviderId,
    );
    if (!provider) {
        yield {
            kind: 'log',
            level: 'error',
            message: `Accounting provider "${descriptor.accountingProviderId}" not registered.`,
        };
        yield { kind: 'done' };
        return;
    }

    await accountingRunRepository.setStatus(input.runId, userId, 'posting');

    const postStart = Date.now();
    yield {
        kind: 'stage',
        message: `Posting ${bookingsToPost.length} mutation(s) to ${descriptor.label}…`,
        stage: 'post',
        status: 'started',
    };

    const session = await provider.openSession({
        meta: input.accountingCredential.meta,
        secret: input.accountingCredential.secret,
    });
    try {
        const outcomes = await Promise.all(
            bookingsToPost.map(async (booking) => {
                try {
                    const result = await RetryPolicy.default().execute(() =>
                        session.postBooking(booking),
                    );
                    const outcome: RunOutcome = {
                        externalId: result.externalId,
                        status: 'posted',
                    };
                    await accountingRunRepository.recordOutcome(
                        input.runId,
                        userId,
                        booking.txnId,
                        outcome,
                    );
                    return {
                        externalId: result.externalId,
                        kind: 'posted' as const,
                        txnId: booking.txnId,
                    };
                } catch (error) {
                    const message =
                        error instanceof Error ? error.message : String(error);
                    await accountingRunRepository.recordOutcome(
                        input.runId,
                        userId,
                        booking.txnId,
                        { error: message, status: 'failed' },
                    );
                    return {
                        error: message,
                        kind: 'failed' as const,
                        txnId: booking.txnId,
                    };
                }
            }),
        );
        let done = 0;
        for (const outcome of outcomes) {
            yield outcome;
            done += 1;
            yield {
                current: done,
                kind: 'progress',
                stage: 'post',
                total: bookingsToPost.length,
            };
        }
    } finally {
        await session.close().catch(swallow);
    }

    const finalRun = await accountingRunRepository.get(input.runId, userId);
    if (finalRun) {
        const isAllPosted = finalRun.bookings.every(
            (b) => finalRun.outcomes[b.txnId]?.status === 'posted',
        );
        const isAnyPosted = finalRun.bookings.some(
            (b) => finalRun.outcomes[b.txnId]?.status === 'posted',
        );
        await accountingRunRepository.setStatus(
            input.runId,
            userId,
            isAllPosted ? 'posted' : isAnyPosted ? 'partial' : 'failed',
        );
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

async function fetchFromApiCredential(
    credential: DecryptedCredential,
    startDate: ISODate,
    fetchImpl?: typeof fetch,
): Promise<{ events: ImportEvent[]; txns: RawTransaction[] }> {
    const events: ImportEvent[] = [];
    const descriptor = CredentialRegistry.instance().get(credential.kind);
    const source = descriptor?.transactionSourceId
        ? SourceRegistry.instance().get(descriptor.transactionSourceId)
        : SourceRegistry.instance().findByCredentialKind(credential.kind);
    if (source?.kind !== 'api') {
        events.push({
            kind: 'log',
            level: 'warn',
            message: `No API source registered for credential kind "${credential.kind}"; skipping.`,
        });
        return { events, txns: [] };
    }
    const label = descriptor?.label ?? credential.kind;
    events.push({
        kind: 'log',
        level: 'info',
        message: `Fetching ${label} transactions via API…`,
    });
    try {
        const txns = await source.fetch({
            fetchImpl,
            from: startDate,
            meta: credential.meta,
            secret: credential.secret,
            to: todayIso(),
        });
        events.push({
            kind: 'log',
            level: 'info',
            message: `${label} API returned ${txns.length} transaction(s).`,
        });
        return { events, txns };
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        events.push({
            kind: 'log',
            level: 'error',
            message: `${label} API fetch failed: ${message}`,
        });
        return { events, txns: [] };
    }
}

function parseFromFileInput(fileInput: FileInput): {
    events: ImportEvent[];
    txns: RawTransaction[];
} {
    const events: ImportEvent[] = [];
    const descriptor = CredentialRegistry.instance().get(
        fileInput.credential.kind,
    );
    const source = descriptor?.transactionSourceId
        ? SourceRegistry.instance().get(descriptor.transactionSourceId)
        : SourceRegistry.instance().findByCredentialKind(
              fileInput.credential.kind,
          );
    if (source?.kind !== 'file') {
        events.push({
            kind: 'log',
            level: 'warn',
            message: `No file source registered for credential kind "${fileInput.credential.kind}"; skipping.`,
        });
        return { events, txns: [] };
    }
    const label = descriptor?.label ?? fileInput.credential.kind;
    try {
        const txns = source.parse(fileInput.content, fileInput.credential.meta);
        events.push({
            kind: 'log',
            level: 'info',
            message: `${label} file provided ${txns.length} transaction(s).`,
        });
        return { events, txns };
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        events.push({
            kind: 'log',
            level: 'error',
            message: `${label} file parse failed: ${message}`,
        });
        return { events, txns: [] };
    }
}

async function persistRun(
    input: PlanInput,
    result: ConversionResult,
): Promise<{ kind: 'run'; runId: RunId }> {
    const runId = await accountingRunRepository.create({
        accountingCredentialId: input.accountingCredentialId,
        apiCredentialIds: input.apiCredentials.map((c) => c.id),
        bookings: result.bookings,
        startDate: input.startDate,
        summary: toRunSummary(result),
        userId: input.userId,
    });
    return { kind: 'run', runId };
}

function swallow(): void {
    return;
}

function toRunSummary(result: ConversionResult): RunSummary {
    const total = result.bookings.reduce(
        (sum, b) => Eur.add(sum, Eur.fromNumber(b.amountEur)),
        Eur.zero(),
    );
    return {
        bookingsCount: result.bookings.length,
        missingBankCurrencies: result.missingBankCurrencies,
        skippedCurrency: result.skippedCurrency,
        skippedNoBank: result.skippedNoBank,
        totalEur: Eur.toNumber(total),
        unknownsCount: result.unknowns.length,
    };
}
