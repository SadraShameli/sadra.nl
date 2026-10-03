import { describe, expect, it } from 'vitest';

import {
    AccountEventKind,
    AccountStage,
    AccountStatus,
    AccountTracking,
    FeeKind,
    firmKeyId,
    FirmKeyKind,
} from '~/lib/prop-accounts/core';
import {
    firmReturns,
    type LedgerAccountRow,
    sampledMean,
    stageFunnel,
} from '~/lib/prop-accounts/metrics';
import { NoiseVerdict, noiseVerdict } from '~/lib/prop-calculator/stats';

import {
    account,
    EVAL_PLAN,
    event,
    fee,
    ledger,
    OTHER_FIRM_EVAL_PLAN,
    payout,
    purchased,
} from './ledgerFixtures';

function accountsWithNets(
    entry: typeof EVAL_PLAN,
    nets: readonly number[],
): { readonly accounts: LedgerAccountRow[]; readonly nets: readonly number[] } {
    return {
        accounts: nets.map(() => account(entry)),
        nets,
    };
}

function ledgerOnly(overrides: Partial<LedgerAccountRow> = {}) {
    return account(EVAL_PLAN, {
        accountSize: 150_000,
        planLabel: 'Rapid 150K',
        planSerial: null,
        stage: AccountStage.Funded,
        tracking: AccountTracking.LedgerOnly,
        ...overrides,
    });
}

function mean(values: readonly number[]) {
    return sampledMean(values) ?? { standardError: null, value: 0 };
}

function netRows(groups: ReturnType<typeof accountsWithNets>[]) {
    const accounts = groups.flatMap((group) => group.accounts);
    const fees = groups.flatMap((group) =>
        group.accounts.flatMap((owner, index) => {
            const net = group.nets[index] ?? 0;
            return net < 0
                ? [fee(owner, FeeKind.EvalPurchase, 0 - net, '2026-09-01')]
                : [];
        }),
    );
    const payouts = groups.flatMap((group) =>
        group.accounts.flatMap((owner, index) => {
            const net = group.nets[index] ?? 0;
            return net > 0 ? [payout(owner, net, { netCents: net })] : [];
        }),
    );
    return ledger({ accounts, fees, payouts });
}

function verdictsOf(
    own: readonly number[],
    other: readonly number[],
): readonly NoiseVerdict[] {
    const book = netRows([
        accountsWithNets(EVAL_PLAN, own),
        accountsWithNets(OTHER_FIRM_EVAL_PLAN, other),
    ]);
    const result = firmReturns(book);
    const verdictOf = (id: string) =>
        result.firms.find((row) => firmKeyId(row.firmKey) === id)?.verdict;
    const ownVerdict = verdictOf(
        firmKeyId({ firmId: EVAL_PLAN.firm.id, kind: FirmKeyKind.Modeled }),
    );
    const otherVerdict = verdictOf(
        firmKeyId({
            firmId: OTHER_FIRM_EVAL_PLAN.firm.id,
            kind: FirmKeyKind.Modeled,
        }),
    );
    expect(ownVerdict).toBe(
        noiseVerdict(mean(own), mean(other), { sharedSeed: false }),
    );
    expect(otherVerdict).toBe(
        noiseVerdict(mean(other), mean(own), { sharedSeed: false }),
    );
    return [
        ownVerdict ?? NoiseVerdict.Unknown,
        otherVerdict ?? NoiseVerdict.Unknown,
    ];
}

describe('firmReturns', () => {
    it('gives spend, payouts, net, multiple, attempts, funded and payout dates per firm', () => {
        const funded = account(EVAL_PLAN, { stage: AccountStage.Funded });
        const failed = account(EVAL_PLAN, {
            purchasedOn: '2026-09-02',
            status: AccountStatus.Busted,
        });
        const result = firmReturns(
            ledger({
                accounts: [funded, failed],
                events: [
                    purchased(funded),
                    event(funded, AccountEventKind.EvalPassed, '2026-09-10'),
                    purchased(failed),
                    event(failed, AccountEventKind.Busted, '2026-09-04'),
                ],
                fees: [
                    fee(funded, FeeKind.EvalPurchase, 10_000, '2026-09-01'),
                    fee(failed, FeeKind.EvalPurchase, 10_000, '2026-09-02'),
                ],
                payouts: [
                    payout(funded, 60_000, {
                        netCents: 60_000,
                        paidOn: '2026-09-15',
                    }),
                    payout(funded, 40_000, {
                        netCents: 40_000,
                        paidOn: '2026-09-25',
                    }),
                ],
            }),
        );
        const firm = result.firms.find(
            (row) => row.firmKey.kind === FirmKeyKind.Modeled,
        );
        expect(firm).toMatchObject({
            accounts: 2,
            accountsWithPayout: 1,
            attempts: 2,
            firstPayoutOn: '2026-09-15',
            fundedAccounts: 1,
            lastPayoutOn: '2026-09-25',
            net: 100_000 - 20_000,
            payouts: 100_000,
            spend: 20_000,
        });
        expect(firm?.multiple).toBeCloseTo(100_000 / 20_000, 6);
    });

    it('leaves the verdict Unknown without at least two accounts on both sides', () => {
        const only = account(EVAL_PLAN, { stage: AccountStage.Funded });
        const other = account(OTHER_FIRM_EVAL_PLAN, {
            stage: AccountStage.Funded,
        });
        const result = firmReturns(
            ledger({
                accounts: [only, other],
                events: [purchased(only), purchased(other)],
                fees: [
                    fee(only, FeeKind.EvalPurchase, 10_000, '2026-09-01'),
                    fee(other, FeeKind.EvalPurchase, 10_000, '2026-09-01'),
                ],
            }),
        );
        for (const firm of result.firms) {
            expect(firm.verdict).toBe(NoiseVerdict.Unknown);
        }
    });

    it('is empty for an empty ledger', () => {
        expect(firmReturns(ledger({})).firms).toEqual([]);
    });
});

describe('firmReturns beyond-noise verdict', () => {
    it('flags both firms BeyondNoise when one firm nets sit far above the other', () => {
        expect(
            verdictsOf([900, 1100, 1000, 1200], [-100, -200, 0, -150]),
        ).toEqual([NoiseVerdict.BeyondNoise, NoiseVerdict.BeyondNoise]);
    });

    it('flags two firms with overlapping nets WithinNoise', () => {
        expect(verdictsOf([100, 200, 150, 250], [120, 180, 160, 220])).toEqual([
            NoiseVerdict.WithinNoise,
            NoiseVerdict.WithinNoise,
        ]);
    });

    it('leaves one account on each side Unknown', () => {
        expect(verdictsOf([900], [-100])).toEqual([
            NoiseVerdict.Unknown,
            NoiseVerdict.Unknown,
        ]);
    });
});

describe('firmReturns across every account kind', () => {
    it('counts a ledger-only account and an unresolvable modeled account under their own firm', () => {
        const modeled = account(EVAL_PLAN, { stage: AccountStage.Funded });
        const atModeledFirm = ledgerOnly();
        const lost = account(OTHER_FIRM_EVAL_PLAN, {
            planSerial: 'retired-plan',
        });
        const result = firmReturns(
            ledger({
                accounts: [modeled, atModeledFirm, lost],
                events: [
                    purchased(modeled),
                    event(modeled, AccountEventKind.EvalPassed, '2026-09-10'),
                ],
                fees: [
                    fee(modeled, FeeKind.EvalPurchase, 10_000, '2026-09-01'),
                    fee(
                        atModeledFirm,
                        FeeKind.EvalPurchase,
                        30_000,
                        '2026-09-01',
                    ),
                    fee(lost, FeeKind.EvalPurchase, 5000, '2026-09-03'),
                ],
                payouts: [
                    payout(modeled, 50_000, { netCents: 40_000 }),
                    payout(atModeledFirm, 200_000, { netCents: 180_000 }),
                ],
            }),
        );
        const rowOf = (firmId: typeof EVAL_PLAN.firm.id) =>
            result.firms.find(
                (row) =>
                    firmKeyId(row.firmKey) ===
                    firmKeyId({ firmId, kind: FirmKeyKind.Modeled }),
            );
        expect(rowOf(EVAL_PLAN.firm.id)).toMatchObject({
            accounts: 2,
            accountsWithPayout: 2,
            ledgerOnlyAccounts: 1,
            payouts: 220_000,
            spend: 40_000,
            unresolvedAccounts: 0,
        });
        expect(rowOf(OTHER_FIRM_EVAL_PLAN.firm.id)).toMatchObject({
            accounts: 1,
            accountsWithPayout: 0,
            ledgerOnlyAccounts: 0,
            payouts: 0,
            spend: 5000,
            unresolvedAccounts: 1,
        });
    });

    it('takes attempts and funded counts from the same rules as the funnel', () => {
        const modeled = account(EVAL_PLAN, { stage: AccountStage.Funded });
        const failed = account(EVAL_PLAN, {
            purchasedOn: '2026-09-02',
            status: AccountStatus.Busted,
        });
        const ledgerFunded = ledgerOnly();
        const ledgerEval = ledgerOnly({ stage: AccountStage.Eval });
        const ledgerEvalPaid = ledgerOnly({ stage: AccountStage.Eval });
        const book = ledger({
            accounts: [
                modeled,
                failed,
                ledgerFunded,
                ledgerEval,
                ledgerEvalPaid,
            ],
            events: [
                purchased(modeled),
                event(modeled, AccountEventKind.EvalPassed, '2026-09-10'),
                purchased(failed),
                event(failed, AccountEventKind.Busted, '2026-09-04'),
            ],
            payouts: [payout(ledgerEvalPaid, 10_000, { netCents: 9000 })],
        });
        const funnelRows = stageFunnel(book).byFirm;
        const returnRows = firmReturns(book).firms;
        expect(returnRows).toHaveLength(funnelRows.length);
        for (const funnel of funnelRows) {
            const row = returnRows.find(
                (candidate) =>
                    firmKeyId(candidate.firmKey) === firmKeyId(funnel.firmKey),
            );
            expect(row?.attempts).toBe(funnel.attempts);
            expect(row?.fundedAccounts).toBe(funnel.funded);
        }
        expect(returnRows[0]).toMatchObject({ attempts: 5, fundedAccounts: 3 });
    });
});
