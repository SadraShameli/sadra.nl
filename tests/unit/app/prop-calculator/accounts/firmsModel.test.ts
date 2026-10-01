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
    FeeKind,
} from '~/lib/prop-accounts/core';
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

    it('counts eval attempts only from resolved accounts, not ledger-only ones', () => {
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
        expect(result.scaleGate.unmetConditions).toContain(
            ScaleGateUnmetCondition.EvalAttemptsBelowThreshold,
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
