import { describe, expect, it } from 'vitest';

import {
    DayStopRuleKind,
    FirmId,
    LifetimeCapScope,
    MffuVariant,
} from '~/lib/prop-calculator/core';
import { findFirm } from '~/lib/prop-calculator/firms';
import { simulate } from '~/lib/prop-calculator/simulator';

const mffPro = findFirm(FirmId.Mffu)?.findPlan({
    accountSize: 50_000,
    firm: FirmId.Mffu,
    variant: MffuVariant.Pro,
});
if (mffPro === undefined) throw new Error('MFF Pro plan not found');

const CAP = mffPro.maxLifetimePayoutDollars;
if (CAP === null) throw new Error('MFF Pro has no lifetime dollar cap');

const ALWAYS_WINS = {
    dayStop: { kind: DayStopRuleKind.None },
    fundedHorizonDays: 120,
    maxEvalDays: 150,
    riskPerTrade: 250,
    rrRatio: 2,
    seed: 1,
    tradesPerDay: 1,
    trials: 1,
    winrate: 1,
} as const;

describe('simulate(): copied MFF Pro accounts share the per-user lifetime cap (PT-12l, PT-12h leftover)', () => {
    it('never reports a combined gross payout above the per-user cap across 3 copies', () => {
        const out = simulate({ ...ALWAYS_WINS, copyAccounts: 3, plan: mffPro });
        expect(out.expectedGrossPayout).toBeLessThanOrEqual(CAP);
        for (const payout of out.fundedPayoutValues) {
            expect(payout).toBeLessThanOrEqual(CAP);
        }
    });

    it('keeps a per-account scope toy plan unpooled: 3 copies can combine past the per-account cap', () => {
        const perAccountPlan = mffPro.withOverrides({
            lifetimeDollarCapScope: LifetimeCapScope.PerAccount,
        });
        const out = simulate({
            ...ALWAYS_WINS,
            copyAccounts: 3,
            plan: perAccountPlan,
        });
        expect(out.expectedGrossPayout).toBeGreaterThan(CAP);
    });

    it('leaves a single copy unchanged under the pooled scope', () => {
        const single = simulate({ ...ALWAYS_WINS, plan: mffPro });
        const one = simulate({ ...ALWAYS_WINS, copyAccounts: 1, plan: mffPro });
        expect(one.expectedGrossPayout).toBeCloseTo(
            single.expectedGrossPayout,
            6,
        );
    });

    it('reduces expected monthly net for 3 copies below the naive per-copy multiple', () => {
        const single = simulate({ ...ALWAYS_WINS, plan: mffPro });
        const copies = simulate({
            ...ALWAYS_WINS,
            copyAccounts: 3,
            plan: mffPro,
        });
        expect(copies.expectedMonthlyNet).toBeLessThan(
            single.expectedMonthlyNet * 3,
        );
    });
});
