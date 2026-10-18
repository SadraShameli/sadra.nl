import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
    type AccountState,
    dollars,
    type Dollars,
    findFirm,
    FirmId,
    newFundedCycleTracker,
    type Plan,
    TopStepVariant,
    TradingPhase,
} from '~/lib/prop-calculator';
import {
    AdviceSource,
    DEFAULT_RULEBOOK,
    FundedSizingAdvisor,
    type FundedSweepFreshRequest,
    NO_PENDING_PAYOUT_COUNTS,
    NO_PERSONAL_CAPS,
} from '~/lib/prop-calculator/advisor';
import {
    cappedFundedRisk,
    cappedRisk,
} from '~/lib/prop-calculator/advisor/policy';
import { DEFAULT_FUNDED_FLAT_CANDIDATES } from '~/lib/prop-calculator/optimize';

const ROUNDING_OVERSHOOT = 1e-9;

const REPO_ROOT = path.resolve(import.meta.dirname, '../../../../..');

function accountState(): AccountState {
    return {
        balance: 51_500,
        bestDayProfit: 0,
        consecutiveIdleDays: 0,
        intradayHighProfit: 0,
        peakDayCloseProfit: 0,
        peakIntradayProfit: 0,
        qualifyingDays: 20,
        startingBalance: 50_000,
        threshold: 48_000,
        thresholdLocked: false,
        todayPnL: 0,
        tradingDays: 20,
    };
}

function flatCandidatesFor(maxRisk: Dollars | null): readonly number[] {
    const state = accountState();
    const advisor = new FundedSizingAdvisor({
        account: {
            assumptions: [],
            contractLimit: null,
            cushion: state.balance - state.threshold,
            fundedTracker: newFundedCycleTracker(state),
            kind: TradingPhase.Funded,
            plan: plan(),
            resolvedDailyLossLimit: null,
            state,
            ...NO_PENDING_PAYOUT_COUNTS,
        },
        fundedHorizonDays: 252,
        personalCaps: { ...NO_PERSONAL_CAPS, maxRiskPerTrade: maxRisk },
        rulebook: DEFAULT_RULEBOOK,
        snapshotAsOf: '2026-09-26',
        substate: null,
        today: '2026-09-26',
        trials: 20,
    });
    const fresh = advisor
        .optimumRequests()
        .find(
            (request): request is FundedSweepFreshRequest =>
                request.source === AdviceSource.FundedSweepFresh,
        );
    if (fresh === undefined) throw new Error('expected a fresh funded sweep');
    return fresh.candidates.flat ?? [];
}

function plan(): Plan {
    const found = findFirm(FirmId.TopStep)?.findPlan({
        accountSize: 50_000,
        firm: FirmId.TopStep,
        variant: TopStepVariant.StandardStandard,
    });
    if (!found) throw new Error('TopStep 50K plan missing');
    return found;
}

function sourceOf(relativePath: string): string {
    return readFileSync(path.join(REPO_ROOT, relativePath), 'utf8');
}

describe('one capped-risk helper (PT-19h, PT-68g LOW a)', () => {
    it('caps a risk at the personal max risk and leaves it alone with no cap or a looser cap', () => {
        expect(cappedRisk(500, null)).toBe(500);
        expect(cappedRisk(500, dollars(250))).toBe(250);
        expect(cappedRisk(100, dollars(250))).toBe(100);
        expect(cappedRisk(250, dollars(250))).toBe(250);
    });

    it('prices the documented funded risk through the same helper', () => {
        const fundedRisk = DEFAULT_RULEBOOK.funded.riskCents / 100;

        expect(cappedFundedRisk(DEFAULT_RULEBOOK, null)).toBe(fundedRisk);
        expect(cappedFundedRisk(DEFAULT_RULEBOOK, fundedRisk / 2)).toBe(
            cappedRisk(fundedRisk, dollars(fundedRisk / 2)),
        );
    });

    it('keeps no second copy of the cap in the funded advisor or the engine policy builder', () => {
        const funded = sourceOf(
            'src/lib/prop-calculator/advisor/FundedSizingAdvisor.ts',
        );
        const builder = sourceOf(
            'src/lib/prop-calculator/advisor/EnginePolicyBuilder.ts',
        );

        expect(funded).not.toContain('personalBounded(');
        expect(builder).not.toMatch(/lowerOf\(base\.(funded)?[rR]iskPerTrade/);
        expect(builder).not.toMatch(/lowerOf\(.*maxRiskPerTrade/);
    });
});

describe('personalBoundedFlats clamps a candidate that overshoots the cap by cent rounding noise (PT-19h, PT-68g LOW b)', () => {
    const top = DEFAULT_FUNDED_FLAT_CANDIDATES.at(-1) ?? 0;

    it('clamps the top candidate when the cap sits less than a cent below it', () => {
        const cap = dollars(top - ROUNDING_OVERSHOOT);

        const flats = flatCandidatesFor(cap);

        expect(Math.max(...flats)).toBe(cap);
        expect(flats.every((flat) => flat <= cap)).toBe(true);
        expect(flats).toEqual([
            ...DEFAULT_FUNDED_FLAT_CANDIDATES.slice(0, -1),
            cap,
        ]);
    });

    it('clamps an overshooting candidate in the middle of the list too', () => {
        const cap = dollars(250 - ROUNDING_OVERSHOOT);

        const flats = flatCandidatesFor(cap);

        expect(flats).toEqual([150, 200, cap]);
    });

    it('keeps the default candidates when the cap is the top candidate itself or above it', () => {
        expect(flatCandidatesFor(dollars(top))).toEqual(
            DEFAULT_FUNDED_FLAT_CANDIDATES,
        );
        expect(flatCandidatesFor(dollars(top + 1))).toEqual(
            DEFAULT_FUNDED_FLAT_CANDIDATES,
        );
    });
});
