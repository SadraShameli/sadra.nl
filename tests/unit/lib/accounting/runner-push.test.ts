import { beforeEach, describe, expect, it, vi } from 'vitest';

import type {
    AccountingProvider,
    OpenSessionOptions,
    PostBookingResult,
    ProviderSession,
} from '~/lib/accounting/providers/provider';
import type { ImportEvent } from '~/lib/accounting/runner';
import type { AccountingRun } from '~/lib/accounting/runs/repo';
import type { RunOutcome, RunStatus } from '~/lib/accounting/runs/types';

import { currencyCodeSchema } from '~/lib/accounting/core/currency';
import { isoDateSchema } from '~/lib/accounting/core/date';
import {
    CredentialId,
    ExternalId,
    LedgerId,
    RunId,
    UserId,
} from '~/lib/accounting/core/ids';
import { ProviderRegistry } from '~/lib/accounting/providers/provider';

const store = vi.hoisted(() => {
    const runs = new Map<string, AccountingRun>();
    return {
        runs,
        stored: (id: string, userId: string): AccountingRun | null => {
            const run = runs.get(id);
            return run?.userId === userId ? run : null;
        },
    };
});

vi.mock('~/lib/accounting/runs/repo', () => {
    const { stored } = store;
    return {
        accountingRunRepo: {
            async claimForPosting(
                id: string,
                userId: string,
            ): Promise<AccountingRun | null> {
                await Promise.resolve();
                const run = stored(id, userId);
                if (run === null || run.status === 'posting') return null;
                const claimed = { ...run, status: 'posting' as const };
                store.runs.set(id, claimed);
                return claimed;
            },
            async get(id: string, userId: string) {
                await Promise.resolve();
                return stored(id, userId);
            },
            async recordOutcome(
                id: string,
                userId: string,
                txnId: string,
                outcome: RunOutcome,
            ) {
                await Promise.resolve();
                const run = stored(id, userId);
                if (run === null) return;
                store.runs.set(id, {
                    ...run,
                    outcomes: { ...run.outcomes, [txnId]: outcome },
                });
            },
            async setStatus(
                id: string,
                userId: string,
                status: RunStatus,
                errorMessage: null | string = null,
            ) {
                await Promise.resolve();
                const run = stored(id, userId);
                if (run === null) return;
                store.runs.set(id, { ...run, errorMessage, status });
            },
        },
    };
});

const { runPush } = await import('~/lib/accounting/runner');

const USER = UserId('user-1');
const RUN = RunId('run-1');
const TARGET = CredentialId('moneybird-target');
const OTHER = CredentialId('moneybird-other');

class RecordingProvider implements AccountingProvider {
    readonly id = 'moneybird';
    readonly label = 'Moneybird';
    openSessions = 0;
    readonly posted: string[] = [];

    constructor(private readonly isSessionRejected: boolean) {}

    async openSession(_options: OpenSessionOptions): Promise<ProviderSession> {
        this.openSessions += 1;
        await Promise.resolve();
        if (this.isSessionRejected) throw new Error('Rejected credentials');
        return {
            close: async () => {
                await Promise.resolve();
            },
            latestMutationDate: async () => {
                await Promise.resolve();
                return null;
            },
            listLedgers: async () => {
                await Promise.resolve();
                return [];
            },
            listMutations: async () => {
                await Promise.resolve();
                return [];
            },
            postBooking: async (booking): Promise<PostBookingResult> => {
                await new Promise((resolve) => setTimeout(resolve, 5));
                this.posted.push(booking.txnId);
                return { externalId: ExternalId(`ext-${booking.txnId}`) };
            },
            taxCodes: () => Promise.reject(new Error('unused')),
        };
    }
}

async function drain(
    events: AsyncIterable<ImportEvent>,
): Promise<ImportEvent[]> {
    return Array.fromAsync(events);
}

function plannedRun(): AccountingRun {
    const ledger = { id: LedgerId('1'), label: 'Ledger' };
    return {
        accountingCredentialId: TARGET,
        apiCredentialIds: [],
        bookings: ['txn-a', 'txn-b'].map((txnId) => ({
            amountEur: 10,
            bank: ledger,
            counterpartLedger: ledger,
            counterpartName: 'Shop',
            date: isoDateSchema.parse('2026-01-02'),
            direction: 'OUT' as const,
            notes: [],
            sourceCurrency: currencyCodeSchema.parse('EUR'),
            taxCode: 'NONE',
            txnId,
        })),
        createdAt: new Date('2026-01-03T00:00:00Z'),
        errorMessage: null,
        id: RUN,
        outcomes: {},
        startDate: '2026-01-01',
        status: 'planned',
        summary: {
            bookingsCount: 2,
            missingBankCurrencies: [],
            skippedCurrency: 0,
            skippedNoBank: 0,
            totalEur: 20,
            unknownsCount: 0,
        },
        updatedAt: new Date('2026-01-03T00:00:00Z'),
        userId: USER,
    };
}

function push(credentialId: string) {
    return runPush({
        accountingCredential: {
            id: credentialId,
            kind: 'moneybird',
            meta: {},
            secret: 'secret',
        },
        runId: RUN,
        userId: USER,
    });
}

function useProvider(provider: RecordingProvider): void {
    ProviderRegistry.instance().register(provider);
}

beforeEach(() => {
    store.runs.clear();
    store.runs.set(RUN, plannedRun());
});

describe('runPush', () => {
    it('posts each booking once when two pushes of the same run overlap', async () => {
        const provider = new RecordingProvider(false);
        useProvider(provider);

        await Promise.all([drain(push(TARGET)), drain(push(TARGET))]);

        expect(
            provider.posted.toSorted((left, right) =>
                left.localeCompare(right),
            ),
        ).toEqual(['txn-a', 'txn-b']);
        expect(store.runs.get(RUN)?.status).toBe('posted');
    });

    it('marks the run failed with the reason when the provider session cannot open', async () => {
        useProvider(new RecordingProvider(true));

        await drain(push(TARGET));

        const run = store.runs.get(RUN);
        expect(run?.status).toBe('failed');
        expect(run?.errorMessage).toContain('Rejected credentials');
    });

    it('refuses to post a run with a credential other than its saved target', async () => {
        const provider = new RecordingProvider(false);
        useProvider(provider);

        const events = await drain(push(OTHER));

        expect(provider.openSessions).toBe(0);
        expect(events).toContainEqual(
            expect.objectContaining({ kind: 'log', level: 'error' }),
        );
        expect(store.runs.get(RUN)?.status).toBe('planned');
    });
});
