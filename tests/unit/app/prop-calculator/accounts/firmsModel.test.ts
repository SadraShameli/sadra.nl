import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { firmsModelOf } from '~/app/(app)/prop-calculator/accounts/firms/firmsModel';
import {
    ScaleGateStatus,
    ScaleGateUnmetCondition,
} from '~/lib/prop-accounts/bankroll';
import {
    AccountEventKind,
    AccountStage,
    AccountTracking,
    compareText,
    FeeKind,
    firmKeyId,
} from '~/lib/prop-accounts/core';
import { LiveTransferRateUnavailable } from '~/lib/prop-accounts/firms';
import { type SampleThresholds } from '~/lib/prop-calculator/advisor';

import {
    account,
    EVAL_PLAN,
    event,
    fee,
    ledger,
    payout,
    purchased,
} from '../../../lib/prop-accounts/metrics/ledgerFixtures';

const NO_THRESHOLDS: SampleThresholds = {
    minClosedRounds: null,
    minEndedAccounts: null,
    minEvalAttempts: null,
    minFundedAccounts: null,
    minTrades: null,
};

describe('firmsModelOf', () => {
    it('combines the roster, live-transfer rate and scale gate from one ledger', () => {
        const funded = account(EVAL_PLAN, { stage: AccountStage.Funded });
        const built = ledger({
            accounts: [funded],
            events: [
                purchased(funded),
                event(funded, AccountEventKind.EvalPassed, '2026-09-10'),
            ],
            fees: [fee(funded, FeeKind.EvalPurchase, 10_000, '2026-09-01')],
            payouts: [payout(funded, 60_000, { paidOn: '2026-09-20' })],
        });
        const result = firmsModelOf({
            asOf: '2026-10-01',
            ledger: built,
            thresholds: NO_THRESHOLDS,
            trades: 0,
        });
        expect(result.roster.firms).toHaveLength(1);
        expect(result.roster.firms[0]?.lifetimeAccounts).toBe(1);
        expect(result.transferRate.perFirm).toHaveLength(1);
        expect(result.scaleGate.status).toBe(ScaleGateStatus.ThresholdsNotSet);
    });

    it('counts a ledger-only account as one eval attempt, the same rule as every other attempts figure', () => {
        const funded = account(EVAL_PLAN, { stage: AccountStage.Funded });
        const ledgerOnlyAccount = account(EVAL_PLAN, {
            planLabel: 'Rapid 150K',
            planSerial: null,
            tracking: AccountTracking.LedgerOnly,
        });
        const built = ledger({
            accounts: [funded, ledgerOnlyAccount],
            events: [
                purchased(funded),
                event(funded, AccountEventKind.EvalPassed, '2026-09-10'),
                purchased(ledgerOnlyAccount),
                event(
                    ledgerOnlyAccount,
                    AccountEventKind.EvalPassed,
                    '2026-09-05',
                ),
            ],
            fees: [fee(funded, FeeKind.EvalPurchase, 10_000, '2026-09-01')],
            payouts: [payout(funded, 60_000, { paidOn: '2026-09-20' })],
        });
        const result = firmsModelOf({
            asOf: '2026-10-01',
            ledger: built,
            thresholds: {
                minClosedRounds: null,
                minEndedAccounts: null,
                minEvalAttempts: 2,
                minFundedAccounts: 1,
                minTrades: 5,
            },
            trades: 5,
        });
        expect(result.scaleGate.unmetConditions).not.toContain(
            ScaleGateUnmetCondition.EvalAttemptsBelowThreshold,
        );
    });

    it('builds the page for two transfers against one paid payout, with the reason instead of a throw', () => {
        const first = account(EVAL_PLAN, {
            purchasedOn: '2026-01-01',
            stage: AccountStage.Funded,
        });
        const second = account(EVAL_PLAN, {
            purchasedOn: '2026-01-02',
            stage: AccountStage.Funded,
        });
        const built = ledger({
            accounts: [first, second],
            events: [
                purchased(first),
                event(first, AccountEventKind.EvalPassed, '2026-01-05'),
                event(first, AccountEventKind.MovedLive, '2026-03-10'),
                purchased(second),
                event(second, AccountEventKind.EvalPassed, '2026-01-06'),
                event(second, AccountEventKind.MovedLive, '2026-03-12'),
            ],
            payouts: [payout(first, 5000, { paidOn: '2026-02-01' })],
        });
        const inputs = {
            asOf: '2026-04-01',
            ledger: built,
            thresholds: NO_THRESHOLDS,
            trades: 0,
        };
        expect(() => firmsModelOf(inputs)).not.toThrow();
        const [row] = firmsModelOf(inputs).transferRate.perFirm;
        expect(row?.perPaidPayout).toBeNull();
        expect(row?.perPaidPayoutUnavailable).toBe(
            LiveTransferRateUnavailable.MoreTransfersThanPayouts,
        );
    });

    it('gives every firm the roster lists a transfer-rate row, ledger-only firms included', () => {
        const modeled = account(EVAL_PLAN, { stage: AccountStage.Funded });
        const ledgerOnlyExternal = account(EVAL_PLAN, {
            externalFirmId: '0b8c7f0e-6f3a-4f55-9a3e-8f4c1d2e3a4b',
            firmId: null,
            planLabel: 'Hola Prime 100K',
            planSerial: null,
            stage: AccountStage.Live,
            tracking: AccountTracking.LedgerOnly,
        });
        const result = firmsModelOf({
            asOf: '2026-10-01',
            ledger: ledger({
                accounts: [modeled, ledgerOnlyExternal],
                events: [purchased(modeled)],
            }),
            thresholds: NO_THRESHOLDS,
            trades: 0,
        });
        const rosterKeys = result.roster.firms.map((entry) =>
            firmKeyId(entry.firmKey),
        );
        const rateKeys = result.transferRate.perFirm.map((row) =>
            firmKeyId(row.firmKey),
        );
        expect(rosterKeys).toHaveLength(2);
        expect(rateKeys.toSorted(compareText)).toStrictEqual(
            rosterKeys.toSorted(compareText),
        );
    });

    it('is empty for an empty ledger', () => {
        const result = firmsModelOf({
            asOf: '2026-10-01',
            ledger: ledger({}),
            thresholds: NO_THRESHOLDS,
            trades: 0,
        });
        expect(result.roster.firms).toEqual([]);
        expect(result.transferRate.perFirm).toEqual([]);
        expect(result.scaleGate.status).toBe(ScaleGateStatus.ThresholdsNotSet);
    });
});

describe('firmsModel duplication guard (PT-62e)', () => {
    it('assembles the scale gate inputs through scaleGateFromLedger, not a re-derived copy', () => {
        const source = readFileSync(
            path.join(
                process.cwd(),
                'src/app/(app)/prop-calculator/accounts/firms/firmsModel.ts',
            ),
            'utf8',
        );
        expect(source).not.toContain('scaleGateOf(');
        expect(source).toContain('scaleGateFromLedger(');
    });
});
