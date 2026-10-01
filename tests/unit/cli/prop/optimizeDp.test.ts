import type { ArgsDef } from 'citty';

import { parseArgs } from 'citty';
import { describe, expect, it, vi } from 'vitest';

import optimizeDp, {
    bundleRenewalNote,
    dpArguments,
    dpGridSettingsLine,
    dpPayoutSettingsLine,
    dpSolverConfig,
    EMPIRICAL_MAX_ATTEMPTS,
    empiricalSimInputs,
    empiricalSummaryLines,
    fundedConsistencyGridNote,
    fundedCycleBaselineGapWarning,
    fundedDpModelGapWarning,
    fundedGridSaturationLine,
    type FundedGridSaturationTally,
    fundedGridSaturationWarning,
    fundedIneligibilityMessage,
    fundedResetModelNote,
    fundedValueIterationLine,
    instrumentFundedDayPolicyForSaturation,
    readDpInputs,
    registryWarmUpFailureWarning,
    renewalObjective,
    resolveDpPlan,
    shareAtOrAboveGridTop,
} from '~/cli/commands/prop/optimize/dp/command';
import {
    commonSimArguments,
    payoutRequestPolicyArgument,
    tradingArguments,
} from '~/cli/commands/prop/shared';
import {
    type AccountState,
    ApexVariant,
    type DayPolicy,
    dollars,
    E8FuturesVariant,
    effectivePayoutRequest,
    FirmId,
    type FundedCycleSnapshot,
    InstrumentSymbol,
    MffuVariant,
    minimumPayoutRequest,
    PayoutRequestPolicy,
    type Plan,
    PolicySizing,
    type PositionSizingConfig,
    resolvePositionSizing,
    type SimOutputs,
    simulate,
    TopStepVariant,
    TRADING_DAYS_PER_YEAR,
} from '~/lib/prop-calculator';
import {
    DayStopRuleKind,
    FtmoFuturesVariant,
    FundedNextVariant,
    PayoutFloorEffect,
    TradingPhase,
} from '~/lib/prop-calculator/core';
import {
    RateSearchStatus,
    solveAverageRewardPolicy,
} from '~/lib/prop-calculator/core/AverageRewardSolver';
import {
    FUNDED_GRID_SATURATION_WARNING_SHARE,
    FundedDpModelGapKind,
    fundedGridSaturationGap,
} from '~/lib/prop-calculator/core/FundedDpModelGaps';
import {
    computeFundedStateValue,
    findRegistryPlanId,
    type FundedStateValueResult,
    isFundedDpEligible,
    warmFirmsRegistryCache,
} from '~/lib/prop-calculator/core/FundedStateValue';
import { PayoutCountTieredPayoutCap } from '~/lib/prop-calculator/core/PayoutCap';
import { ALL_FIRMS } from '~/lib/prop-calculator/firms';
import { ApexTraderFunding } from '~/lib/prop-calculator/firms/apex/ApexTraderFunding';
import { E8Futures } from '~/lib/prop-calculator/firms/e8futures/E8Futures';
import { FtmoFutures } from '~/lib/prop-calculator/firms/ftmo-futures/FtmoFutures';
import { FundedNext } from '~/lib/prop-calculator/firms/fundednext/FundedNext';
import { MyFundedFutures } from '~/lib/prop-calculator/firms/mffu/MyFundedFutures';
import { TopStep } from '~/lib/prop-calculator/firms/topstep/TopStep';
import { TakeProfitTrader } from '~/lib/prop-calculator/firms/tpt/TakeProfitTrader';

vi.mock(
    import('~/lib/prop-calculator/core/AverageRewardSolver'),
    async (importOriginal) => {
        const actual = await importOriginal();
        return {
            ...actual,
            solveAverageRewardPolicy: vi.fn(actual.solveAverageRewardPolicy),
        };
    },
);

vi.mock(import('~/lib/prop-calculator'), async (importOriginal) => {
    const actual = await importOriginal();
    return { ...actual, simulate: vi.fn(actual.simulate) };
});

vi.mock(
    import('~/lib/prop-calculator/core/FundedStateValue'),
    async (importOriginal) => {
        const actual = await importOriginal();
        return {
            ...actual,
            warmFirmsRegistryCache: vi.fn(actual.warmFirmsRegistryCache),
        };
    },
);

function apexEodPlan(): Plan {
    const plan = new ApexTraderFunding().findPlan({
        accountSize: 50_000,
        firm: FirmId.Apex,
        variant: ApexVariant.Eod,
    });
    if (!plan) throw new Error('Apex EOD 50K plan not found');
    return plan;
}

function apexIntradayPlan(): Plan {
    const plan = new ApexTraderFunding().findPlan({
        accountSize: 50_000,
        firm: FirmId.Apex,
        variant: ApexVariant.Intraday,
    });
    if (!plan) throw new Error('Apex Intraday 50K plan not found');
    return plan;
}

function findE8SignaturePlan(): Plan {
    const plan = new E8Futures().findPlan({
        accountSize: 50_000,
        firm: FirmId.E8Futures,
        variant: E8FuturesVariant.Signature,
    });
    if (!plan) throw new Error('E8 Signature 50K plan not found');
    return plan;
}

function legacyPlan(): Plan {
    const plan = new FundedNext().findPlan({
        accountSize: 50_000,
        firm: FirmId.FundedNext,
        variant: FundedNextVariant.Legacy,
    });
    if (!plan) throw new Error('FundedNext Legacy 50K plan not found');
    return plan;
}

function mffBuilderPlan(): Plan {
    const plan = new MyFundedFutures().findPlan({
        accountSize: 50_000,
        firm: FirmId.Mffu,
        variant: MffuVariant.Builder,
    });
    if (!plan) throw new Error('MFF Builder 50K plan not found');
    return plan;
}

function mffProPlan(): Plan {
    const plan = new MyFundedFutures().findPlan({
        accountSize: 50_000,
        firm: FirmId.Mffu,
        variant: MffuVariant.Pro,
    });
    if (!plan) throw new Error('MFF Pro 50K plan not found');
    return plan;
}

function topStepNoFeeStandardPlan(): Plan {
    const plan = new TopStep().findPlan({
        accountSize: 50_000,
        firm: FirmId.TopStep,
        variant: TopStepVariant.NoFeeStandard,
    });
    if (!plan) throw new Error('TopStep no-fee-standard 50K plan not found');
    return plan;
}

function tptProPlan(): Plan {
    const plan = new TakeProfitTrader().findPlan({
        accountSize: 50_000,
        firm: FirmId.Tpt,
    });
    if (!plan) throw new Error('TPT 50K plan not found');
    return plan;
}

describe('fundedIneligibilityMessage', () => {
    it('names the cumulative-qualifying-days payout cap as a reason, for FundedNext Legacy', () => {
        const message = fundedIneligibilityMessage(legacyPlan());
        expect(message).toContain('QualifyingDaysMilestonePayoutCap');
        expect(message).toContain('cumulative qualifying days');
    });

    it('no longer lists a terminating daily loss limit, only the continuously peak-scaled one', () => {
        const message = fundedIneligibilityMessage(legacyPlan());
        expect(message).not.toContain('terminating');
        expect(message).toContain('PeakProfitShare');
    });

    it('FTMO Futures Pro 50K, whose funded daily loss limit terminates the account, is now DP-eligible', () => {
        const plan = new FtmoFutures().findPlan({
            accountSize: 50_000,
            firm: FirmId.FtmoFutures,
            variant: FtmoFuturesVariant.Pro,
        });
        if (!plan) throw new Error('FTMO Futures Pro 50K plan not found');
        expect(plan.isDailyLossLimitTerminating(TradingPhase.Funded)).toBe(
            true,
        );
        expect(isFundedDpEligible(plan)).toBe(true);
    });
});

const BUILDER_DRAWDOWN = 2000;

function cushionGridOf(multiples: {
    fineStep?: number;
    fineTop: number;
    lockedTop?: number;
    tailStep?: number;
    tailTop?: number;
}): FundedStateValueResult['cushionGrid'] {
    const tailTop = multiples.tailTop ?? multiples.fineTop;
    return {
        fineStepDollars: (multiples.fineStep ?? 0.1) * BUILDER_DRAWDOWN,
        fineTopDollars: multiples.fineTop * BUILDER_DRAWDOWN,
        lockedTopDollars: (multiples.lockedTop ?? tailTop) * BUILDER_DRAWDOWN,
        tailStepDollars: (multiples.tailStep ?? 1) * BUILDER_DRAWDOWN,
        tailTopDollars: tailTop * BUILDER_DRAWDOWN,
    };
}

describe('fundedConsistencyGridNote (N-65)', () => {
    it('says nothing for a plan without a funded consistency rule', () => {
        const plan = new FtmoFutures().findPlan({
            accountSize: 50_000,
            firm: FirmId.FtmoFutures,
            variant: FtmoFuturesVariant.Growth,
        });
        if (!plan) throw new Error('FTMO Futures Growth 50K plan not found');
        expect(plan.fundedConsistencyRule()).toBeNull();
        const grid = cushionGridOf({ fineTop: 6, tailTop: 30 });
        expect(fundedConsistencyGridNote(plan, grid)).toBeNull();
        expect(
            fundedConsistencyGridNote(topStepNoFeeStandardPlan(), grid),
        ).toBeNull();
    });

    it('discloses for MFF Builder that the cushion grid truncates both the balance and a day ending above the grid top, so neither direction of the consistency error is guaranteed there, without claiming the DP is conservative (N-65 review). Re-pinned for WP58c (N-86 stage 2): the grid top is now 30 drawdowns (a fine grid up to 6, then a coarse tail), not a flat 6', () => {
        const plan = mffBuilderPlan();
        const note = fundedConsistencyGridNote(
            plan,
            cushionGridOf({ fineTop: 6, tailTop: 30 }),
        );
        expect(note).not.toBeNull();
        expect(note?.startsWith(`${plan.label}: `)).toBe(true);
        expect(note).toContain('50%');
        expect(note).toContain('30 drawdowns');
        expect(note).toContain('fine grid up to 6');
        expect(note).toContain('rounded up between grid steps');
        expect(note).toContain('a day that ends above the grid top');
        expect(note).toContain('neither direction is guaranteed');
        expect(note).not.toContain('conservative');
        expect(note).not.toContain(
            'never allows a payout the real rule denies',
        );
        expect(note?.slice(plan.label.length)).not.toContain('\u{2014}');
    });

    it('reads the tops the solver resolved, so a fine top at or above the tail top says the grid is uniform up to it with no coarse tail past it (WP58d)', () => {
        const plan = mffBuilderPlan();
        const note = fundedConsistencyGridNote(
            plan,
            cushionGridOf({ fineTop: 40 }),
        );
        expect(note).not.toBeNull();
        expect(note).toContain('40 drawdowns');
        expect(note).toContain('uniform grid up to 40');
        expect(note).not.toContain('coarse tail');
        expect(note).not.toContain('30 drawdowns');
        expect(note).not.toContain('fine grid up to');
    });

    it('reflects a resolved coarse tail top as the grid top while keeping the coarse tail wording (WP58d)', () => {
        const note = fundedConsistencyGridNote(
            mffBuilderPlan(),
            cushionGridOf({ fineTop: 4, tailTop: 12 }),
        );
        expect(note).toContain('stops at 12 drawdowns');
        expect(note).toContain('fine grid up to 4, then a coarse tail past it');
        expect(note).not.toContain('30 drawdowns');
    });

    it('reports the real fine top the solver widened to, not the requested one (WP58d review)', () => {
        const note = fundedConsistencyGridNote(
            mffBuilderPlan(),
            cushionGridOf({ fineTop: 9, tailTop: 30 }),
        );
        expect(note).toContain('fine grid up to 9, then a coarse tail past it');
        expect(note).not.toContain('fine grid up to 6');
    });

    it('says the locked grid is uniform up to the locked top when the working range is wider than a pinned tail (WP58d review)', () => {
        const note = fundedConsistencyGridNote(
            mffBuilderPlan(),
            cushionGridOf({ fineTop: 9, lockedTop: 6 }),
        );
        expect(note).toContain('stops at 6 drawdowns');
        expect(note).toContain('uniform grid up to 6');
        expect(note).not.toContain('coarse tail');
    });

    it('discloses that a best day past the largest possible one-day swing is clamped, which understates it and can let the DP allow a payout the real rule denies (WP58d review)', () => {
        const note = fundedConsistencyGridNote(
            mffBuilderPlan(),
            cushionGridOf({ fineTop: 6, tailTop: 30 }),
        );
        expect(note).toContain('largest swing one trading day can produce');
        expect(note).toContain('clamped down to that cap');
        expect(note).toContain('understates the best day');
        expect(note).toContain('allow a payout the real rule denies');
    });
});

describe('fundedValueIterationLine (N-63)', () => {
    it('states the funded sweep count and the error bound on every funded state value', () => {
        expect(
            fundedValueIterationLine({
                sweepCount: 535,
                valueErrorBound: 5.9594,
            }),
        ).toBe(
            "funded value iteration: 535 sweeps, every funded state value within $5.96 of the DP's exact fixed point",
        );
    });
});

function toyFundedCycle(): FundedCycleSnapshot {
    return {
        cycleBestDayProfit: 0,
        dayGateProgress: 0,
        fundedResetsUsed: 0,
        lastPayoutBalance: 0,
        payoutsIssued: 0,
    };
}

describe('fundedGridSaturationGap (N-86, WP58 stage 1)', () => {
    it('reports no gap below the warning threshold', () => {
        expect(fundedGridSaturationGap(0)).toBeNull();
        expect(
            fundedGridSaturationGap(
                FUNDED_GRID_SATURATION_WARNING_SHARE - 0.001,
            ),
        ).toBeNull();
    });

    it('reports the gap at and above the warning threshold', () => {
        expect(
            fundedGridSaturationGap(FUNDED_GRID_SATURATION_WARNING_SHARE),
        ).toEqual({
            kind: FundedDpModelGapKind.FundedGridSaturationHigh,
            shareAtOrAboveTop: FUNDED_GRID_SATURATION_WARNING_SHARE,
        });
        expect(fundedGridSaturationGap(1)).toEqual({
            kind: FundedDpModelGapKind.FundedGridSaturationHigh,
            shareAtOrAboveTop: 1,
        });
    });

    it('honours a caller-supplied warning threshold instead of the default', () => {
        expect(fundedGridSaturationGap(0.2, 0.5)).toBeNull();
        expect(fundedGridSaturationGap(0.5, 0.5)).not.toBeNull();
    });
});

describe('fundedGridSaturationLine (N-86, WP58 stage 1)', () => {
    it('formats the measured share of funded trial-days at or above the grid top as a percent', () => {
        expect(fundedGridSaturationLine(0)).toBe(
            "funded grid saturation: 0.0% of funded trial-days had a cushion or post-payout balance at or above this DP's grid top",
        );
        expect(fundedGridSaturationLine(1)).toBe(
            "funded grid saturation: 100.0% of funded trial-days had a cushion or post-payout balance at or above this DP's grid top",
        );
    });
});

describe('shareAtOrAboveGridTop (N-86, WP58 stage 1)', () => {
    it('is 0 when no funded day was ever sampled, instead of dividing by zero', () => {
        const tally: FundedGridSaturationTally = {
            fundedDayCount: 0,
            saturatedDayCount: 0,
        };
        expect(shareAtOrAboveGridTop(tally)).toBe(0);
    });

    it('divides the saturated day count by the sampled funded day count', () => {
        const tally: FundedGridSaturationTally = {
            fundedDayCount: 10,
            saturatedDayCount: 3,
        };
        expect(shareAtOrAboveGridTop(tally)).toBeCloseTo(0.3);
    });

    it('is 1 when every sampled funded day was saturated', () => {
        const tally: FundedGridSaturationTally = {
            fundedDayCount: 4,
            saturatedDayCount: 4,
        };
        expect(shareAtOrAboveGridTop(tally)).toBe(1);
    });
});

describe('fundedGridSaturationWarning (N-86, WP58 stage 1)', () => {
    it('says nothing while the measured share stays below the warning threshold', () => {
        expect(
            fundedGridSaturationWarning(topStepNoFeeStandardPlan(), 0),
        ).toBeNull();
        expect(
            fundedGridSaturationWarning(
                topStepNoFeeStandardPlan(),
                FUNDED_GRID_SATURATION_WARNING_SHARE - 0.001,
            ),
        ).toBeNull();
    });

    it('names the plan, the measured share and N-86 once the share clears the warning threshold', () => {
        const plan = topStepNoFeeStandardPlan();
        const warning = fundedGridSaturationWarning(plan, 1);
        expect(warning).not.toBeNull();
        expect(warning?.startsWith(`${plan.label}: `)).toBe(true);
        expect(warning).toContain('100.0%');
        expect(warning).toContain('N-86');
        expect(warning).toContain('clamped to the top cell');
    });
});

describe('instrumentFundedDayPolicyForSaturation (N-86, WP58 stage 1)', () => {
    it('returns the day policy unchanged when it has no computeRisk to wrap', () => {
        const dayPolicy: DayPolicy = {
            ladder: [10, 20],
            maxLossesPerDay: null,
            sizing: PolicySizing.WholeContracts,
            stopRule: { kind: DayStopRuleKind.None },
        };
        const tally: FundedGridSaturationTally = {
            fundedDayCount: 0,
            saturatedDayCount: 0,
        };

        const wrapped = instrumentFundedDayPolicyForSaturation(
            dayPolicy,
            () => true,
            tally,
        );

        expect(wrapped).toBe(dayPolicy);
        expect(tally).toEqual({ fundedDayCount: 0, saturatedDayCount: 0 });
    });

    it('samples the grid-saturation predicate once per day at the first trade, and tallies a saturated day', () => {
        const state = topStepNoFeeStandardPlan().initialState();
        const fundedCycle = toyFundedCycle();
        const computeRisk = vi.fn(
            (_state: AccountState, tradeIndexToday: number) =>
                100 + tradeIndexToday,
        );
        const dayPolicy: DayPolicy = {
            computeRisk,
            ladder: [100, 100, 100],
            maxLossesPerDay: null,
            sizing: PolicySizing.WholeContracts,
            stopRule: { kind: DayStopRuleKind.None },
        };
        const tally: FundedGridSaturationTally = {
            fundedDayCount: 0,
            saturatedDayCount: 0,
        };
        const checkGridSaturation = vi.fn(() => true);

        const wrapped = instrumentFundedDayPolicyForSaturation(
            dayPolicy,
            checkGridSaturation,
            tally,
        );

        expect(wrapped.computeRisk?.(state, 0, fundedCycle)).toBe(100);
        expect(wrapped.computeRisk?.(state, 1, fundedCycle)).toBe(101);
        expect(wrapped.computeRisk?.(state, 2, fundedCycle)).toBe(102);

        expect(tally).toEqual({ fundedDayCount: 1, saturatedDayCount: 1 });
        expect(checkGridSaturation).toHaveBeenCalledTimes(1);
        expect(checkGridSaturation).toHaveBeenCalledWith(state, fundedCycle);
        expect(computeRisk).toHaveBeenCalledTimes(3);
    });

    it('does not tally a saturated day when the predicate reports false', () => {
        const state = topStepNoFeeStandardPlan().initialState();
        const dayPolicy: DayPolicy = {
            computeRisk: () => 50,
            ladder: [50],
            maxLossesPerDay: null,
            sizing: PolicySizing.WholeContracts,
            stopRule: { kind: DayStopRuleKind.None },
        };
        const tally: FundedGridSaturationTally = {
            fundedDayCount: 0,
            saturatedDayCount: 0,
        };

        const wrapped = instrumentFundedDayPolicyForSaturation(
            dayPolicy,
            () => false,
            tally,
        );
        wrapped.computeRisk?.(state, 0);

        expect(tally).toEqual({ fundedDayCount: 1, saturatedDayCount: 0 });
    });

    it('counts a later day separately from an earlier one', () => {
        const state = topStepNoFeeStandardPlan().initialState();
        const dayPolicy: DayPolicy = {
            computeRisk: () => 50,
            ladder: [50],
            maxLossesPerDay: null,
            sizing: PolicySizing.WholeContracts,
            stopRule: { kind: DayStopRuleKind.None },
        };
        const tally: FundedGridSaturationTally = {
            fundedDayCount: 0,
            saturatedDayCount: 0,
        };
        let isSaturated = true;

        const wrapped = instrumentFundedDayPolicyForSaturation(
            dayPolicy,
            () => isSaturated,
            tally,
        );
        wrapped.computeRisk?.(state, 0);
        isSaturated = false;
        wrapped.computeRisk?.(state, 0);

        expect(tally).toEqual({ fundedDayCount: 2, saturatedDayCount: 1 });
    });
});

describe('fundedDpModelGapWarning', () => {
    it('returns null for Apex EOD: its payoutLadder (6 steps) and maxLifetimePayouts (6) both fit inside the DP payout-count regime cap of 6', () => {
        expect(fundedDpModelGapWarning(apexEodPlan())).toBeNull();
    });

    it('returns null for Apex Intraday, for the same reason as EOD', () => {
        expect(fundedDpModelGapWarning(apexIntradayPlan())).toBeNull();
    });

    it('returns null for E8 Signature: its tiered payout cap tiers (0, 2, 4) and maxLifetimePayouts (5) both fit inside the regime cap', () => {
        expect(fundedDpModelGapWarning(findE8SignaturePlan())).toBeNull();
    });

    it('returns null for MFF Builder: its payoutLadder (5 steps) and maxLifetimePayouts (5) both fit inside the regime cap', () => {
        expect(fundedDpModelGapWarning(mffBuilderPlan())).toBeNull();
    });

    it('is not null for TopStep no-fee-standard: it has no count-keyed payout rule, but it does carry the ReleaseFloor disclosure (N-89, WP58d)', () => {
        const warning = fundedDpModelGapWarning(topStepNoFeeStandardPlan());
        expect(warning).not.toBeNull();
        expect(warning).toContain('N-89');
    });

    it('warns about MFF Pro’s $100,000 lifetime payout-dollar cap and says this DP ignores it (optimistic)', () => {
        const warning = fundedDpModelGapWarning(mffProPlan());
        expect(warning).not.toBeNull();
        expect(warning).toContain('$100,000');
        expect(warning).toContain('maxLifetimePayoutDollars');
        expect(warning).toContain('ignores');
        expect(warning).toContain('cumulativePayout');
    });

    it('warns that MFF Pro’s payout-triggered lock lets the pre-lock floor trail past the DP offset grid', () => {
        const warning = fundedDpModelGapWarning(mffProPlan());
        expect(warning).toContain(
            'locks its funded drawdown only on the first payout',
        );
        expect(warning).toContain('saturate');
        expect(warning).toContain('understates the balance');
        expect(warning).toContain('pessimistic');
        expect(warning).not.toContain('slightly optimistic');
    });

    it('warns about a PayoutCountTieredPayoutCap tier beyond the regime cap and says it saturates', () => {
        const plan = topStepNoFeeStandardPlan().withOverrides({
            payoutBalanceShareCap: undefined,
            payoutCapOverride: new PayoutCountTieredPayoutCap([
                {
                    fromPayoutIndex: 0,
                    regime: {
                        balanceShareCap: null,
                        requestCap: dollars(1000),
                    },
                },
                {
                    fromPayoutIndex: 9,
                    regime: {
                        balanceShareCap: null,
                        requestCap: dollars(2000),
                    },
                },
            ]),
            payoutRequestCap: undefined,
        });

        const warning = fundedDpModelGapWarning(plan);
        expect(warning).not.toBeNull();
        expect(warning).toContain('payout #10');
        expect(warning).toContain('regime cap of 6');
        expect(warning).toContain('saturate');
    });

    it('warns that TPT PRO closes its funded phase for an empty calendar week, which this exact DP does not model (N-86, WP48b leftover)', () => {
        const warning = fundedDpModelGapWarning(tptProPlan());
        expect(warning).not.toBeNull();
        expect(warning).toContain('calendar week');
        expect(warning).toContain('does not model');
    });

    it('names no calendar week for TopStep no-fee-standard, whose funded phase has no calendar-week inactivity rule (it still carries the unrelated ReleaseFloor disclosure, N-86 WP57)', () => {
        const warning = fundedDpModelGapWarning(topStepNoFeeStandardPlan());
        expect(warning).not.toBeNull();
        expect(warning).not.toContain('calendar week');
    });

    it("prints TPT PRO's own plan label exactly once on the calendar-week gap line, not twice (N-87 leftover, WP55)", () => {
        const plan = tptProPlan();
        const warning = fundedDpModelGapWarning(plan);
        expect(warning).not.toBeNull();
        const labelOccurrences =
            warning === null ? 0 : warning.split(plan.label).length - 1;
        expect(labelOccurrences).toBe(1);
    });
});

describe('fundedDpModelGapWarning discloses the ReleaseFloor prediction gap (N-89, WP58d, reworded from the WP57 N-86 text after gate D11-r4 passed; its run() pins --max-tail-cushion-multiple 6, the fine top, because the default 30 drawdown tail took that TopStep solve to about 120 s and it checks the printed warning, not the grid)', () => {
    it('names the audit item and points at the optimize funded flat comparison, for TopStep no-fee-standard', () => {
        const plan = topStepNoFeeStandardPlan();
        const warning = fundedDpModelGapWarning(plan);
        expect(warning).not.toBeNull();
        expect(warning).toContain('N-89');
        expect(warning).toContain('optimize funded');
        expect(warning).toContain('ReleaseFloor');
        expect(warning).not.toContain('\u{2014}');
    });

    it('tells the reader to trust the empirical replay line, says the predicted rate overstated the replay at the default grid, and does not claim the policy fails', () => {
        const warning =
            fundedDpModelGapWarning(topStepNoFeeStandardPlan()) ?? '';
        expect(warning).toContain('empirical replay');
        expect(warning).toContain('overstated');
        expect(warning).toContain('default grid');
        expect(warning).toContain('best flat row');
        expect(warning).not.toContain('N-86');
        expect(warning).not.toContain('did not match its own simulation');
        expect(warning).not.toContain('size positions by the documented rule');
    });

    it('prints the plan label exactly once on that warning', () => {
        const plan = topStepNoFeeStandardPlan();
        const warning = fundedDpModelGapWarning(plan);
        const labelOccurrences =
            warning === null ? 0 : warning.split(plan.label).length - 1;
        expect(labelOccurrences).toBe(1);
    });

    it('says nothing for FTMO Growth, whose funded payout floor effect is not ReleaseFloor', () => {
        const plan = new FtmoFutures().findPlan({
            accountSize: 50_000,
            firm: FirmId.FtmoFutures,
            variant: FtmoFuturesVariant.Growth,
        });
        if (!plan) throw new Error('FTMO Growth 50K plan not found');
        expect(fundedDpModelGapWarning(plan)).toBeNull();
    });

    it('says nothing for every non-ReleaseFloor plan across every firm', () => {
        for (const firm of ALL_FIRMS) {
            for (const plan of firm.plans) {
                if (plan.payoutFloorEffect === PayoutFloorEffect.ReleaseFloor)
                    continue;
                expect(
                    fundedDpModelGapWarning(plan) ?? '',
                    plan.label,
                ).not.toContain('N-89');
            }
        }
    });

    it("run() prints the disclosure once for TopStep no-fee-standard, with the plan's own label once", async () => {
        const argv = [
            '--firm',
            'topstep',
            '--variant',
            'no-fee-standard',
            '--eval-days',
            '2',
            '--funded-days',
            '2',
            '--iterations',
            '1',
            '--trials',
            '10',
            '--max-tail-cushion-multiple',
            '6',
        ];
        const { stdout } = await capturedRun(argv);
        const plan = topStepNoFeeStandardPlan();

        expect(stdout).toContain('N-89');
        expect(stdout.split('ReleaseFloor').length - 1).toBe(1);
        const warning = fundedDpModelGapWarning(plan);
        expect(warning).not.toBeNull();
        expect(stdout.split(warning ?? '').length - 1).toBe(1);
    }, 600_000);
});

describe('optimize dp run() measures funded grid saturation from the real replay (N-86, WP58 stage 1; WP58d: the run pins --max-tail-cushion-multiple 6, the fine top, because the default 30 drawdown tail took each TopStep solve here from seconds to about 50 s and these tests mock the saturation check, not the grid)', () => {
    const topStepSmallArgv = [
        '--firm',
        'topstep',
        '--variant',
        'no-fee-standard',
        '--eval-days',
        '2',
        '--funded-days',
        '2',
        '--iterations',
        '1',
        '--trials',
        '10',
        '--max-tail-cushion-multiple',
        '6',
    ];

    it('reports a 100% share and the saturation warning when every sampled funded day hits the grid top', async () => {
        vi.mocked(solveAverageRewardPolicy).mockImplementationOnce((config) => {
            const solution = solveAverageRewardPolicy(config);
            return {
                ...solution,
                fundedResult: {
                    ...solution.fundedResult,
                    isGridSaturated: () => true,
                },
            };
        });

        const { stdout } = await capturedRun(topStepSmallArgv);

        expect(stdout).toContain(
            "funded grid saturation: 100.0% of funded trial-days had a cushion or post-payout balance at or above this DP's grid top",
        );
        expect(stdout).toContain(
            'clamped to the top cell, which distorts both the predicted value and the policy there',
        );
    }, 600_000);

    it('reports a 0% share and no saturation warning when no sampled funded day ever hits the grid top', async () => {
        vi.mocked(solveAverageRewardPolicy).mockImplementationOnce((config) => {
            const solution = solveAverageRewardPolicy(config);
            return {
                ...solution,
                fundedResult: {
                    ...solution.fundedResult,
                    isGridSaturated: () => false,
                },
            };
        });

        const { stdout } = await capturedRun(topStepSmallArgv);

        expect(stdout).toContain(
            "funded grid saturation: 0.0% of funded trial-days had a cushion or post-payout balance at or above this DP's grid top",
        );
        expect(stdout).not.toContain('clamped to the top cell');
    }, 600_000);
});

async function resolveArguments(): Promise<ArgsDef> {
    const resolvable = optimizeDp.args;
    if (!resolvable) throw new Error('optimize dp command has no args');
    const resolved =
        typeof resolvable === 'function' ? resolvable() : resolvable;
    return resolved instanceof Promise ? resolved : resolved;
}

const GATE_D11_RATE_SEARCH_SOLVES = 9;
const SPARE_RATE_SEARCH_SOLVES = 2;

describe('optimize dp arguments', () => {
    it('defaults --rebuy-lag-days to 0', async () => {
        const arguments_ = await resolveArguments();
        const parsed = parseArgs([], arguments_);
        expect(parsed['rebuy-lag-days']).toBe('0');
    });

    it('defaults --iterations to 12 max rate-search solves', async () => {
        const arguments_ = await resolveArguments();
        expect(arguments_.iterations).toBeDefined();
        const parsed = parseArgs([], arguments_);
        expect(parsed.iterations).toBe('12');
    });

    it(`defaults --iterations to at least ${SPARE_RATE_SEARCH_SOLVES} solves above the ${GATE_D11_RATE_SEARCH_SOLVES} that FTMO Growth and TopStep No-fee Standard need to converge at the gate-D11 inputs`, () => {
        expect(Number(dpArguments.iterations.default)).toBeGreaterThanOrEqual(
            GATE_D11_RATE_SEARCH_SOLVES + SPARE_RATE_SEARCH_SOLVES,
        );
    });

    it('defaults --funded-days to one trading year, the shared TRADING_DAYS_PER_YEAR', () => {
        expect(dpArguments['funded-days'].default).toBe(
            String(TRADING_DAYS_PER_YEAR),
        );
    });
});

function resolvedDpPlan(argv: string[]): Plan {
    return resolveDpPlan(parseArgs<typeof dpArguments>(argv, dpArguments));
}

describe('optimize dp prose uses no double-hyphen dash (WP24)', () => {
    it('writes the funded gap warnings and every flag description it owns without a -- dash', async () => {
        const arguments_ = await resolveArguments();
        const texts = [
            fundedDpModelGapWarning(mffProPlan()) ?? '',
            ...Object.values(arguments_).map(
                (argument) => argument.description ?? '',
            ),
        ];

        expect(texts[0]).not.toBe('');
        for (const text of texts) {
            expect(text).not.toContain(' -- ');
            expect(text).not.toContain('\u{2014}');
        }
    });
});

describe('optimize dp --funded-reset names the plan reset terms (N-34)', () => {
    const alphaZeroArgv = ['--firm', 'alphafutures', '--variant', 'zero'];

    it('prints the whole Alpha Zero Qualified Reset note, terms then DP model, when --funded-reset is passed', () => {
        const note = fundedResetModelNote(
            resolvedDpPlan([...alphaZeroArgv, '--funded-reset']),
        );

        expect(note).toBe(
            "$50K · Zero: takes the Qualified Reset: $499 each, up to 2 per account, only while the account never requested a payout, within 7 calendar days of a breach. This DP values every reset exactly: a breach before the first payout is worth the next reset layer's start value less the discounted reset fee, and an inactivity closure is never reset. Its day policy picks the layer from the resets already used, so the empirical run takes the same decisions the DP valued.",
        );
    });

    it('says nothing without the flag, or for a plan without a funded reset', () => {
        expect(fundedResetModelNote(resolvedDpPlan(alphaZeroArgv))).toBeNull();
        expect(
            fundedResetModelNote(
                resolvedDpPlan([
                    '--firm',
                    'mffu',
                    '--variant',
                    'rapid-eod',
                    '--funded-reset',
                ]),
            ),
        ).toBeNull();
    });

    it('prints the reset terms line from run() before the solve starts', async () => {
        const argv = [...alphaZeroArgv, '--funded-reset'];
        const written: string[] = [];
        const write = vi
            .spyOn(process.stdout, 'write')
            .mockImplementation((chunk: string | Uint8Array) => {
                written.push(String(chunk));
                return true;
            });
        const writeError = vi
            .spyOn(process.stderr, 'write')
            .mockImplementation(() => true);
        vi.mocked(solveAverageRewardPolicy).mockImplementationOnce(() => {
            throw new Error('stop after the preamble');
        });
        const exitCode = process.exitCode;
        try {
            await optimizeDp.run?.({
                args: parseArgs<typeof dpArguments>(argv, dpArguments),
                cmd: optimizeDp,
                rawArgs: argv,
            });
        } finally {
            write.mockRestore();
            writeError.mockRestore();
            process.exitCode = exitCode;
        }

        const note = fundedResetModelNote(resolvedDpPlan(argv));
        expect(note).not.toBeNull();
        expect(written.some((chunk) => chunk.includes(note ?? ''))).toBe(true);
    });
});

describe('optimize dp takes the MFF Pro one-time early withdrawal opt-in (N-64, T30)', () => {
    it('solves the opted-in rule when --early-withdrawal is passed', () => {
        expect(
            resolvedDpPlan([
                '--firm',
                'mffu',
                '--variant',
                'pro',
                '--early-withdrawal',
            ]).takesOneTimeEarlyWithdrawal,
        ).toBe(true);
    });

    it('solves the default rule without the flag', () => {
        expect(
            resolvedDpPlan(['--firm', 'mffu', '--variant', 'pro'])
                .takesOneTimeEarlyWithdrawal,
        ).toBe(false);
        expect(mffProPlan().takesOneTimeEarlyWithdrawal).toBe(false);
    });

    it('leaves a plan without the rule unchanged', () => {
        const plan = resolvedDpPlan([
            '--firm',
            'mffu',
            '--variant',
            'builder',
            '--early-withdrawal',
        ]);

        expect(plan.oneTimeEarlyWithdrawal).toBeNull();
        expect(plan.takesOneTimeEarlyWithdrawal).toBe(false);
    });
});

describe('optimize dp run() hands the opted-in plan to both the DP objective and the empirical replay (N-64)', () => {
    it('solves and replays the MFF Pro rule with the one-time early withdrawal taken when --early-withdrawal is passed', async () => {
        const argv = [
            '--firm',
            'mffu',
            '--variant',
            'pro',
            '--early-withdrawal',
            '--eval-days',
            '2',
            '--funded-days',
            '2',
            '--iterations',
            '1',
            '--trials',
            '10',
        ];
        vi.mocked(solveAverageRewardPolicy).mockClear();
        vi.mocked(simulate).mockClear();
        const exitCode = process.exitCode;
        try {
            await optimizeDp.run?.({
                args: parseArgs<typeof dpArguments>(argv, dpArguments),
                cmd: optimizeDp,
                rawArgs: argv,
            });
        } finally {
            process.exitCode = exitCode;
        }

        expect(
            vi
                .mocked(solveAverageRewardPolicy)
                .mock.calls.map(
                    ([config]) =>
                        config.objective.plan.takesOneTimeEarlyWithdrawal,
                ),
        ).toStrictEqual([true]);
        expect(
            vi
                .mocked(simulate)
                .mock.calls.map(
                    ([inputs]) => inputs.plan.takesOneTimeEarlyWithdrawal,
                ),
        ).toStrictEqual([true]);
    }, 180_000);
});

function parseDpInputs(argv: string[]) {
    return readDpInputs(parseArgs<typeof dpArguments>(argv, dpArguments));
}

describe('optimize dp flag bounds', () => {
    it.each([
        ['winrate', '40', /--winrate must be a fraction in \[0, 1\]/],
        ['trials', '0', /--trials must be a whole number >= 1/],
        ['seed', '1.5', /--seed must be a whole number/],
        ['rr', '0', /--rr must be a number > 0/],
        ['eval-days', '0', /--eval-days must be a whole number >= 1/],
        ['funded-days', '0', /--funded-days must be a whole number >= 1/],
        ['iterations', '2.5', /--iterations must be a whole number >= 1/],
        ['copy-accounts', '0', /--copy-accounts must be a whole number >= 1/],
        ['eval-discount', '101', /--eval-discount/],
        ['request-size', '0', /--request-size must be a number > 0/],
        ['retain-cushion', '-1', /--retain-cushion must be a number >= 0/],
        [
            'action-step-multiple',
            '0',
            /--action-step-multiple must be a number > 0/,
        ],
        [
            'cushion-step-multiple',
            '-1',
            /--cushion-step-multiple must be a number > 0/,
        ],
        [
            'max-action-multiple',
            '0',
            /--max-action-multiple must be a number > 0/,
        ],
        [
            'max-cushion-multiple',
            '-1',
            /--max-cushion-multiple must be a number > 0/,
        ],
        [
            'max-tail-cushion-multiple',
            '0',
            /--max-tail-cushion-multiple must be a number > 0/,
        ],
        [
            'tail-cushion-step-multiple',
            '-1',
            /--tail-cushion-step-multiple must be a number > 0/,
        ],
    ])('rejects --%s %s, naming the flag', (flag, value, message) => {
        expect(() => parseDpInputs([`--${flag}=${value}`])).toThrow(message);
    });

    it('parses the grid-multiple flags (N-86 ablation flags), left undefined by default', () => {
        expect(parseDpInputs([]).actionStepMultiple).toBeUndefined();
        expect(parseDpInputs([]).cushionStepMultiple).toBeUndefined();
        expect(parseDpInputs([]).maxActionMultiple).toBeUndefined();
        expect(parseDpInputs([]).maxCushionMultiple).toBeUndefined();
        const inputs = parseDpInputs([
            '--action-step-multiple=0.25',
            '--cushion-step-multiple=0.5',
            '--max-action-multiple=2',
            '--max-cushion-multiple=3',
        ]);
        expect(inputs.actionStepMultiple).toBe(0.25);
        expect(inputs.cushionStepMultiple).toBe(0.5);
        expect(inputs.maxActionMultiple).toBe(2);
        expect(inputs.maxCushionMultiple).toBe(3);
    });

    it('parses the tail flags (WP58d), left undefined by default', () => {
        expect(parseDpInputs([]).maxTailCushionMultiple).toBeUndefined();
        expect(parseDpInputs([]).tailCushionStepMultiple).toBeUndefined();
        const inputs = parseDpInputs([
            '--max-tail-cushion-multiple=12',
            '--tail-cushion-step-multiple=2',
        ]);
        expect(inputs.maxTailCushionMultiple).toBe(12);
        expect(inputs.tailCushionStepMultiple).toBe(2);
    });

    it('rejects a tail step finer than the cushion step, naming both flags (WP58d)', () => {
        expect(() =>
            parseDpInputs([
                '--cushion-step-multiple=0.5',
                '--tail-cushion-step-multiple=0.25',
            ]),
        ).toThrow(
            /--tail-cushion-step-multiple \(0\.25\) must be at least --cushion-step-multiple \(0\.5\)/,
        );
    });

    it('rejects a tail step finer than the default cushion step, saying the cushion step is the default (WP58d)', () => {
        expect(() =>
            parseDpInputs(['--tail-cushion-step-multiple=0.05']),
        ).toThrow(
            /--tail-cushion-step-multiple \(0\.05\) must be at least --cushion-step-multiple \(0\.1, the default\)/,
        );
    });

    it('rejects a cushion step coarser than the default tail step (WP58d)', () => {
        expect(() => parseDpInputs(['--cushion-step-multiple=2'])).toThrow(
            /--tail-cushion-step-multiple \(1, the default\) must be at least --cushion-step-multiple \(2\)/,
        );
    });

    it('accepts a cushion step coarser than the default tail step when the tail is off, because the guard protects only the tail region (WP58d review)', () => {
        const inputs = parseDpInputs([
            '--cushion-step-multiple=2',
            '--max-cushion-multiple=6',
            '--max-tail-cushion-multiple=6',
        ]);
        expect(inputs.cushionStepMultiple).toBe(2);
        expect(inputs.maxTailCushionMultiple).toBe(6);
    });

    it('still rejects a tail step finer than the cushion step when a tail is on, whether the tail top is the default or an explicit one (WP58d review)', () => {
        expect(() =>
            parseDpInputs([
                '--cushion-step-multiple=2',
                '--max-tail-cushion-multiple=12',
            ]),
        ).toThrow(
            /--tail-cushion-step-multiple \(1, the default\) must be at least --cushion-step-multiple \(2\)/,
        );
    });

    it('accepts a tail step equal to the cushion step (WP58d)', () => {
        expect(
            parseDpInputs([
                '--cushion-step-multiple=0.5',
                '--tail-cushion-step-multiple=0.5',
            ]).tailCushionStepMultiple,
        ).toBe(0.5);
    });

    it('rejects an explicit tail top below the fine top, naming both flags (WP58d)', () => {
        expect(() =>
            parseDpInputs([
                '--max-cushion-multiple=8',
                '--max-tail-cushion-multiple=5',
            ]),
        ).toThrow(
            /--max-tail-cushion-multiple \(5\) must be at least --max-cushion-multiple \(8\)/,
        );
    });

    it('rejects an explicit tail top below the default fine top (WP58d)', () => {
        expect(() => parseDpInputs(['--max-tail-cushion-multiple=4'])).toThrow(
            /--max-tail-cushion-multiple \(4\) must be at least --max-cushion-multiple \(6, the default\)/,
        );
    });

    it('accepts a tail top equal to the fine top, and a fine top above the default tail top when no tail top is given (WP58d)', () => {
        expect(
            parseDpInputs([
                '--max-cushion-multiple=8',
                '--max-tail-cushion-multiple=8',
            ]).maxTailCushionMultiple,
        ).toBe(8);
        expect(
            parseDpInputs(['--max-cushion-multiple=40']).maxCushionMultiple,
        ).toBe(40);
    });

    it('reads the defaults', () => {
        expect(parseDpInputs([])).toStrictEqual({
            actionStepMultiple: undefined,
            copyAccounts: 1,
            cushionStepMultiple: undefined,
            discounts: undefined,
            fundedHorizonDays: 252,
            instrument: InstrumentSymbol.NQ,
            maxActionMultiple: undefined,
            maxCushionMultiple: undefined,
            maxEvalDays: 40,
            maxSolves: 12,
            maxTailCushionMultiple: undefined,
            minRetainedCushion: 0,
            payoutRequestPolicy: PayoutRequestPolicy.UpToRequest,
            payoutRequestSize: undefined,
            rebuyLagDays: 0,
            rrRatio: 2,
            seed: 42,
            stopPoints: undefined,
            tailCushionStepMultiple: undefined,
            trials: 4000,
            winrate: 0.4,
        });
    });
});

describe('optimize dp takes the shared --retain-cushion and --request-size flags into the solve and the empirical run (PT-47a, F-150)', () => {
    const policy: DayPolicy = {
        ladder: [200],
        maxLossesPerDay: null,
        sizing: PolicySizing.ContractCapped,
        stopRule: { kind: DayStopRuleKind.None },
    };

    it('reuses the shared flag definitions', () => {
        expect(dpArguments['retain-cushion']).toBe(
            tradingArguments['retain-cushion'],
        );
        expect(dpArguments['request-size']).toBe(
            commonSimArguments['request-size'],
        );
    });

    it('reads both flags', () => {
        const inputs = parseDpInputs([
            '--retain-cushion=2500',
            '--request-size=500',
        ]);
        expect(inputs.minRetainedCushion).toBe(2500);
        expect(inputs.payoutRequestSize).toBe(500);
    });

    it('hands the retained cushion and request size to the funded grid of the solver config', () => {
        const inputs = parseDpInputs([
            '--retain-cushion=2500',
            '--request-size=500',
        ]);
        const objective = renewalObjective(inputs, topStepNoFeeStandardPlan());
        const config = dpSolverConfig(inputs, objective);
        expect(config.fundedGrid?.minRetainedCushion).toBe(2500);
        expect(config.fundedGrid?.payoutRequestSize).toBe(500);
        expect(config.objective).toBe(objective);
        expect(config.maxSolves).toBe(inputs.maxSolves);
        expect(config.rrRatio).toBe(inputs.rrRatio);
        expect(config.winrate).toBe(inputs.winrate);
    });

    it('leaves the request size undefined and the cushion at 0 without the flags, so the solve keeps the plan-default cushion and the whole withdrawable request', () => {
        const inputs = parseDpInputs([]);
        const config = dpSolverConfig(
            inputs,
            renewalObjective(inputs, topStepNoFeeStandardPlan()),
        );
        expect(config.fundedGrid?.minRetainedCushion).toBe(0);
        expect(config.fundedGrid?.payoutRequestSize).toBeUndefined();
    });

    it('carries the same two settings into the empirical simulate() inputs', () => {
        const inputs = parseDpInputs([
            '--retain-cushion=2500',
            '--request-size=500',
        ]);
        const simInputs = empiricalSimInputs(
            inputs,
            topStepNoFeeStandardPlan(),
            { evalDayPolicy: policy, fundedDayPolicy: policy },
        );
        expect(simInputs.minRetainedCushion).toBe(2500);
        expect(simInputs.payoutRequestSize).toBe(500);
        expect(
            empiricalSimInputs(parseDpInputs([]), topStepNoFeeStandardPlan(), {
                evalDayPolicy: policy,
                fundedDayPolicy: policy,
            }).payoutRequestSize,
        ).toBeUndefined();
    });

    it('applies effectivePayoutRequest to the solver config and the empirical sim inputs, raising a request below the plan minimum (MFF Pro 50K with 500 receives its $1,000 plan minimum)', () => {
        const plan = mffProPlan();
        expect(minimumPayoutRequest(plan)).toBe(1000);
        const inputs = parseDpInputs(['--request-size=500']);
        expect(inputs.payoutRequestSize).toBe(500);

        const objective = renewalObjective(inputs, plan);
        const config = dpSolverConfig(inputs, objective);
        expect(config.fundedGrid?.payoutRequestSize).toBe(
            effectivePayoutRequest(plan, 500),
        );
        expect(config.fundedGrid?.payoutRequestSize).toBe(1000);

        const simInputs = empiricalSimInputs(inputs, plan, {
            evalDayPolicy: policy,
            fundedDayPolicy: policy,
        });
        expect(simInputs.payoutRequestSize).toBe(1000);
    });

    it('leaves the request size untouched when it already meets the plan minimum', () => {
        const plan = topStepNoFeeStandardPlan();
        const inputs = parseDpInputs(['--request-size=500']);
        const config = dpSolverConfig(inputs, renewalObjective(inputs, plan));
        expect(config.fundedGrid?.payoutRequestSize).toBe(500);
    });

    it('names the resolved retained cushion and the request size in one line', () => {
        const plan = resolvedDpPlan([
            '--firm',
            'mffu',
            '--variant',
            'rapid-eod',
        ]);
        expect(plan.defaultRetainedCushion()).toBe(2000);
        expect(
            dpPayoutSettingsLine(
                plan,
                parseDpInputs(['--retain-cushion=2500', '--request-size=500']),
            ),
        ).toBe(
            'payouts in the DP and the empirical run: retained cushion $2,500 (the larger of --retain-cushion $2,500 and the plan floor $2,000), payout request $500',
        );
        expect(dpPayoutSettingsLine(plan, parseDpInputs([]))).toBe(
            'payouts in the DP and the empirical run: retained cushion $2,000 (the larger of --retain-cushion $0 and the plan floor $2,000), payout request the whole withdrawable amount',
        );
    });

    it('names the effective (plan-minimum-raised) request size, not the raw --request-size, when the request is below the plan minimum', () => {
        const plan = mffProPlan();
        expect(minimumPayoutRequest(plan)).toBe(1000);
        const inputs = parseDpInputs(['--request-size=500']);
        expect(inputs.payoutRequestSize).toBe(500);
        const line = dpPayoutSettingsLine(plan, inputs);
        expect(line).toContain('payout request $1,000');
        expect(line).not.toContain('payout request $500');
    });

    it('run() hands the solver and simulate() the same cushion and request size, and prints the settings line', async () => {
        const argv = [
            '--firm',
            'mffu',
            '--variant',
            'rapid-eod',
            '--retain-cushion',
            '2500',
            '--request-size',
            '500',
            '--eval-days',
            '2',
            '--funded-days',
            '2',
            '--iterations',
            '1',
            '--trials',
            '10',
        ];
        vi.mocked(solveAverageRewardPolicy).mockClear();
        vi.mocked(simulate).mockClear();

        const { stdout } = await capturedRun(argv);

        const solverGrids = vi
            .mocked(solveAverageRewardPolicy)
            .mock.calls.map(([config]) => ({
                minRetainedCushion: config.fundedGrid?.minRetainedCushion,
                payoutRequestSize: config.fundedGrid?.payoutRequestSize,
            }));
        const simulated = vi.mocked(simulate).mock.calls.map(([inputs]) => ({
            minRetainedCushion: inputs.minRetainedCushion,
            payoutRequestSize: inputs.payoutRequestSize,
        }));
        expect(solverGrids).toStrictEqual([
            { minRetainedCushion: 2500, payoutRequestSize: 500 },
        ]);
        expect(simulated).toStrictEqual(solverGrids);
        expect(stdout).toContain(
            'payouts in the DP and the empirical run: retained cushion $2,500',
        );
    }, 600_000);
});

describe('optimize dp exposes the funded and eval grid settings as flags for fast ablations (N-86)', () => {
    it('leaves both grids at their internal defaults without the flags', () => {
        const inputs = parseDpInputs([]);
        const config = dpSolverConfig(
            inputs,
            renewalObjective(inputs, topStepNoFeeStandardPlan()),
        );
        expect(config.fundedGrid?.actionStepMultiple).toBeUndefined();
        expect(config.fundedGrid?.cushionStepMultiple).toBeUndefined();
        expect(config.fundedGrid?.maxActionMultiple).toBeUndefined();
        expect(config.fundedGrid?.maxCushionMultiple).toBeUndefined();
        expect(config.fundedGrid?.maxTailCushionMultiple).toBeUndefined();
        expect(config.fundedGrid?.tailCushionStepMultiple).toBeUndefined();
        expect(config.evalGrid?.actionStepDollars).toBeUndefined();
        expect(config.evalGrid?.cushionStepDollars).toBeUndefined();
        expect(config.evalGrid?.maxActionDollars).toBeUndefined();
    });

    it('hands the raw multiples straight to the funded grid of the solver config', () => {
        const inputs = parseDpInputs([
            '--action-step-multiple=0.25',
            '--cushion-step-multiple=0.5',
            '--max-action-multiple=2',
            '--max-cushion-multiple=3',
        ]);
        const config = dpSolverConfig(
            inputs,
            renewalObjective(inputs, topStepNoFeeStandardPlan()),
        );
        expect(config.fundedGrid?.actionStepMultiple).toBe(0.25);
        expect(config.fundedGrid?.cushionStepMultiple).toBe(0.5);
        expect(config.fundedGrid?.maxActionMultiple).toBe(2);
        expect(config.fundedGrid?.maxCushionMultiple).toBe(3);
    });

    it("converts the same multiples to dollars for the eval grid, off the plan's own eval drawdown amount", () => {
        const plan = topStepNoFeeStandardPlan();
        const inputs = parseDpInputs([
            '--action-step-multiple=0.25',
            '--cushion-step-multiple=0.5',
            '--max-action-multiple=2',
        ]);
        const evalDrawdownAmount = plan.drawdownFor(TradingPhase.Eval).amount;
        const config = dpSolverConfig(inputs, renewalObjective(inputs, plan));
        expect(config.evalGrid?.actionStepDollars).toBe(
            0.25 * evalDrawdownAmount,
        );
        expect(config.evalGrid?.cushionStepDollars).toBe(
            0.5 * evalDrawdownAmount,
        );
        expect(config.evalGrid?.maxActionDollars).toBe(2 * evalDrawdownAmount);
    });
});

describe('optimize dp hands the tail flags to the funded solve and prints the resolved grid (WP58d)', () => {
    it('hands the raw tail multiples straight to the funded grid of the solver config', () => {
        const inputs = parseDpInputs([
            '--max-tail-cushion-multiple=12',
            '--tail-cushion-step-multiple=2',
        ]);
        const config = dpSolverConfig(
            inputs,
            renewalObjective(inputs, topStepNoFeeStandardPlan()),
        );
        expect(config.fundedGrid?.maxTailCushionMultiple).toBe(12);
        expect(config.fundedGrid?.tailCushionStepMultiple).toBe(2);
    });

    it('describes the default grid as fine steps up to the fine top and a coarse tail up to the tail top, in drawdowns and dollars', () => {
        const plan = mffBuilderPlan();
        expect(
            dpGridSettingsLine(
                plan,
                parseDpInputs([]),
                cushionGridOf({ fineTop: 6, tailTop: 30 }),
            ),
        ).toBe(
            'funded cushion grid: fine steps of 0.1x the drawdown ($200) up to 6x ($12,000), then coarse steps of 1x ($2,000) up to 30x ($60,000)',
        );
    });

    it('reflects every resolved tail and fine value in the line', () => {
        const plan = mffBuilderPlan();
        const inputs = parseDpInputs([
            '--cushion-step-multiple=0.25',
            '--max-cushion-multiple=4',
            '--max-tail-cushion-multiple=12',
            '--tail-cushion-step-multiple=2',
        ]);
        expect(
            dpGridSettingsLine(
                plan,
                inputs,
                cushionGridOf({
                    fineStep: 0.25,
                    fineTop: 4,
                    tailStep: 2,
                    tailTop: 12,
                }),
            ),
        ).toBe(
            'funded cushion grid: fine steps of 0.25x the drawdown ($500) up to 4x ($8,000), then coarse steps of 2x ($4,000) up to 12x ($24,000)',
        );
    });

    it('describes a grid whose fine top reaches the tail top as uniform, with no coarse tail', () => {
        const plan = mffBuilderPlan();
        expect(
            dpGridSettingsLine(
                plan,
                parseDpInputs(['--max-cushion-multiple=40']),
                cushionGridOf({ fineTop: 40 }),
            ),
        ).toBe(
            'funded cushion grid: uniform steps of 0.1x the drawdown ($200) up to 40x ($80,000)',
        );
        expect(
            dpGridSettingsLine(
                plan,
                parseDpInputs([
                    '--max-cushion-multiple=8',
                    '--max-tail-cushion-multiple=8',
                ]),
                cushionGridOf({ fineTop: 8 }),
            ),
        ).toBe(
            'funded cushion grid: uniform steps of 0.1x the drawdown ($200) up to 8x ($16,000)',
        );
    });

    it('prints the fine top the solver widened to, and says why it differs from --max-cushion-multiple (WP58d review)', () => {
        const line = dpGridSettingsLine(
            mffBuilderPlan(),
            parseDpInputs([]),
            cushionGridOf({ fineTop: 9, tailTop: 30 }),
        );
        expect(line).toBe(
            'funded cushion grid: fine steps of 0.1x the drawdown ($200) up to 9x ($18,000), then coarse steps of 1x ($2,000) up to 30x ($60,000); the fine range reaches 9x instead of the 6x that --max-cushion-multiple asks for, because it must cover the largest swing one trading day can make or the pre-lock offset range',
        );
    });

    it('says an explicit --max-tail-cushion-multiple was moved when the solver resolved a different top (WP58d review)', () => {
        const line = dpGridSettingsLine(
            mffBuilderPlan(),
            parseDpInputs(['--max-tail-cushion-multiple=8']),
            cushionGridOf({ fineTop: 9 }),
        );
        expect(line).toContain('uniform steps of 0.1x');
        expect(line).toContain('up to 9x ($18,000)');
        expect(line).toContain('--max-tail-cushion-multiple asked for 8x');
    });

    it('does not mention the tail flag when the resolved tail top is the one asked for, or when no tail top was asked for (WP58d review)', () => {
        const plan = mffBuilderPlan();
        expect(
            dpGridSettingsLine(
                plan,
                parseDpInputs(['--max-tail-cushion-multiple=12']),
                cushionGridOf({ fineTop: 6, tailTop: 12 }),
            ),
        ).not.toContain('asked for');
        expect(
            dpGridSettingsLine(
                plan,
                parseDpInputs([]),
                cushionGridOf({ fineTop: 6, tailTop: 30 }),
            ),
        ).not.toContain('asked for');
    });

    it('prints the real tail top when a tail step that does not divide the range moved it, and calls a tail that collapsed to no cells uniform (WP58d review)', () => {
        const plan = mffBuilderPlan();
        const moved = dpGridSettingsLine(
            plan,
            parseDpInputs([
                '--max-tail-cushion-multiple=10',
                '--tail-cushion-step-multiple=3',
            ]),
            cushionGridOf({ fineTop: 6, tailStep: 3, tailTop: 9 }),
        );
        expect(moved).toContain('then coarse steps of 3x ($6,000) up to 9x');
        expect(moved).toContain('--max-tail-cushion-multiple asked for 10x');
        const collapsed = dpGridSettingsLine(
            plan,
            parseDpInputs([
                '--max-tail-cushion-multiple=8',
                '--tail-cushion-step-multiple=5',
            ]),
            cushionGridOf({ fineTop: 6, tailStep: 5, tailTop: 6 }),
        );
        expect(collapsed).toContain('uniform steps of 0.1x');
        expect(collapsed).not.toContain('then coarse steps');
    });

    it('run() prints the resolved grid line with the tail flags it was given', async () => {
        mockSolveStatus(RateSearchStatus.Converged);
        const { stdout } = await capturedRun([
            '--firm',
            'mffu',
            '--variant',
            'rapid-eod',
            '--eval-days',
            '2',
            '--funded-days',
            '2',
            '--iterations',
            '1',
            '--trials',
            '10',
            '--max-tail-cushion-multiple=13',
            '--tail-cushion-step-multiple=2',
        ]);
        expect(stdout).toContain(
            'funded cushion grid: fine steps of 0.1x the drawdown ($200) up to 9x ($18,000), then coarse steps of 2x ($4,000) up to 13x ($26,000); the fine range reaches 9x instead of the 6x that --max-cushion-multiple asks for',
        );
    }, 600_000);

    it('run() hands the tail flags to the solver config', async () => {
        mockSolveStatus(RateSearchStatus.Converged);
        await capturedRun([
            '--firm',
            'mffu',
            '--variant',
            'rapid-eod',
            '--eval-days',
            '2',
            '--funded-days',
            '2',
            '--iterations',
            '1',
            '--trials',
            '10',
            '--max-tail-cushion-multiple=10',
            '--tail-cushion-step-multiple=2',
        ]);
        const config = vi.mocked(solveAverageRewardPolicy).mock.lastCall?.[0];
        expect(config?.fundedGrid?.maxTailCushionMultiple).toBe(10);
        expect(config?.fundedGrid?.tailCushionStepMultiple).toBe(2);
    }, 600_000);
});

describe('optimize dp wires --stop-points and --instrument into whole-contract sizing (N-78; WP58d: the end-to-end run pins --max-tail-cushion-multiple 6, the fine top, because the default 30 drawdown tail took it from 7 s to 30 s and it checks the sizing handed to the solver, not the grid)', () => {
    const policy: DayPolicy = {
        ladder: [200],
        maxLossesPerDay: null,
        sizing: PolicySizing.ContractCapped,
        stopRule: { kind: DayStopRuleKind.None },
    };

    it('reuses the shared flag definitions', () => {
        expect(dpArguments.instrument).toBe(commonSimArguments.instrument);
        expect(dpArguments['stop-points']).toBe(
            commonSimArguments['stop-points'],
        );
    });

    it('defaults --instrument to NQ and leaves --stop-points unset', () => {
        const inputs = parseDpInputs([]);
        expect(inputs.instrument).toBe(InstrumentSymbol.NQ);
        expect(inputs.stopPoints).toBeUndefined();
    });

    it('reads both flags', () => {
        const inputs = parseDpInputs(['--stop-points=2', '--instrument=ES']);
        expect(inputs.instrument).toBe(InstrumentSymbol.ES);
        expect(inputs.stopPoints).toBe(2);
    });

    it('hands the resolved whole-contract sizing to both the eval and the funded grid of the solver config, matching resolvePositionSizing', () => {
        const inputs = parseDpInputs(['--stop-points=2', '--instrument=ES']);
        const expected = resolvePositionSizing(InstrumentSymbol.ES, 2);
        expect(expected).not.toBeNull();

        const config = dpSolverConfig(
            inputs,
            renewalObjective(inputs, topStepNoFeeStandardPlan()),
        );
        expect(config.evalGrid?.positionSizing).toStrictEqual(expected);
        expect(config.fundedGrid?.positionSizing).toStrictEqual(expected);
    });

    it('leaves both grids unsized without --stop-points, even though --instrument defaults to NQ', () => {
        const inputs = parseDpInputs([]);
        const config = dpSolverConfig(
            inputs,
            renewalObjective(inputs, topStepNoFeeStandardPlan()),
        );
        expect(config.evalGrid?.positionSizing).toBeNull();
        expect(config.fundedGrid?.positionSizing ?? null).toBeNull();
    });

    it('carries the raw instrument and stop-points through to the empirical simulate() inputs, unresolved (simulate() resolves its own positionSizing)', () => {
        const inputs = parseDpInputs(['--stop-points=2', '--instrument=ES']);
        const simInputs = empiricalSimInputs(
            inputs,
            topStepNoFeeStandardPlan(),
            { evalDayPolicy: policy, fundedDayPolicy: policy },
        );
        expect(simInputs.instrument).toBe(InstrumentSymbol.ES);
        expect(simInputs.stopPoints).toBe(2);
    });

    it('runs the DP end to end with sized contract-limit grids instead of ignoring the flags', async () => {
        const argv = [
            '--firm',
            'topstep',
            '--variant',
            'no-fee-standard',
            '--stop-points',
            '2',
            '--instrument',
            'ES',
            '--eval-days',
            '2',
            '--funded-days',
            '2',
            '--iterations',
            '1',
            '--trials',
            '10',
            '--max-tail-cushion-multiple',
            '6',
        ];
        vi.mocked(solveAverageRewardPolicy).mockClear();

        await capturedRun(argv);

        const expected = resolvePositionSizing(InstrumentSymbol.ES, 2);
        const solverGrids: (null | PositionSizingConfig)[] = vi
            .mocked(solveAverageRewardPolicy)
            .mock.calls.map(
                ([config]) => config.fundedGrid?.positionSizing ?? null,
            );
        expect(solverGrids).toStrictEqual([expected]);
    }, 600_000);
});

describe('optimize dp takes the shared --payout-policy flag into the solve and the empirical run (PT-47b, F-150)', () => {
    const policy: DayPolicy = {
        ladder: [200],
        maxLossesPerDay: null,
        sizing: PolicySizing.ContractCapped,
        stopRule: { kind: DayStopRuleKind.None },
    };

    it('reuses the shared flag definition, defaulting to up-to-request', () => {
        expect(dpArguments['payout-policy']).toBe(
            payoutRequestPolicyArgument['payout-policy'],
        );
        expect(payoutRequestPolicyArgument['payout-policy'].default).toBe(
            PayoutRequestPolicy.UpToRequest,
        );
        expect(
            payoutRequestPolicyArgument['payout-policy'].options,
        ).toStrictEqual(Object.values(PayoutRequestPolicy));
    });

    it('reads the flag into the inputs, defaulting without it', () => {
        expect(parseDpInputs([]).payoutRequestPolicy).toBe(
            PayoutRequestPolicy.UpToRequest,
        );
        expect(
            parseDpInputs(['--payout-policy=full-request-only'])
                .payoutRequestPolicy,
        ).toBe(PayoutRequestPolicy.FullRequestOnly);
    });

    it('hands the policy to the funded grid of the solver config and the empirical simulate() inputs', () => {
        const plan = topStepNoFeeStandardPlan();
        const inputs = parseDpInputs([
            '--payout-policy=full-request-only',
            '--request-size=500',
        ]);
        const config = dpSolverConfig(inputs, renewalObjective(inputs, plan));
        expect(config.fundedGrid?.payoutRequestPolicy).toBe(
            PayoutRequestPolicy.FullRequestOnly,
        );

        const simInputs = empiricalSimInputs(inputs, plan, {
            evalDayPolicy: policy,
            fundedDayPolicy: policy,
        });
        expect(simInputs.payoutRequestPolicy).toBe(
            PayoutRequestPolicy.FullRequestOnly,
        );
    });
});

describe('optimize dp empirical summary (D2)', () => {
    const base = simulate({
        fundedHorizonDays: 20,
        maxEvalDays: 30,
        plan: apexEodPlan(),
        riskPerTrade: 250,
        rrRatio: 2,
        seed: 1,
        tradesPerDay: 4,
        trials: 20,
        winrate: 0.5,
    });
    const out: SimOutputs = {
        ...base,
        evalPassProbability: 0.8,
        fundedSurvivalProbability: 0.1,
    };
    const lines = empiricalSummaryLines(out, out.expectedMonthlyNet, 1);

    it('labels evalPassProbability as the chance of eventually passing within the retry cap, not a per-attempt pass rate (N-62)', () => {
        expect(lines).toContain(
            `eventual eval pass within the ${EMPIRICAL_MAX_ATTEMPTS}-attempt retry cap: 80.0%`,
        );
        expect(lines.some((line) => line.startsWith('eval pass rate'))).toBe(
            false,
        );
    });

    it('adds the funded survive rate as its own line', () => {
        expect(lines).toContain('funded survive: 10.0%');
    });

    it('reports a zero gap when the empirical monthly net equals the DP rate', () => {
        expect(lines).toContain('gap vs DP-predicted monthly rate: $0');
    });
});

describe('optimize dp prices the empirical cross-check like the DP (N-62)', () => {
    const plan = topStepNoFeeStandardPlan();
    const inputs = parseDpInputs([
        '--eval-discount=20',
        '--activation-discount=10',
        '--monthly-discount=5',
        '--copy-accounts=3',
    ]);
    const policy: DayPolicy = {
        ladder: [200],
        maxLossesPerDay: null,
        sizing: PolicySizing.ContractCapped,
        stopRule: { kind: DayStopRuleKind.None },
    };

    it('reads the coupon discounts and the copy count', () => {
        expect(inputs.discounts).toStrictEqual({
            activationPercent: 10,
            evalPercent: 20,
            monthlySubscriptionPercent: 5,
        });
        expect(inputs.copyAccounts).toBe(3);
    });

    it('hands the discounts and copy count to the renewal-cycle objective', () => {
        const objective = renewalObjective(inputs, plan);
        expect(objective.discounts).toStrictEqual(inputs.discounts);
        expect(objective.copyAccounts).toBe(3);
        expect(objective.purchaseDiscounts).toStrictEqual(
            plan.purchaseDiscounts(inputs.discounts, 3),
        );
    });

    it('retries failed evals in the simulate() cross-check, with the same discounts and copy count', () => {
        const simInputs = empiricalSimInputs(inputs, plan, {
            evalDayPolicy: policy,
            fundedDayPolicy: policy,
        });
        expect(EMPIRICAL_MAX_ATTEMPTS).toBeGreaterThanOrEqual(1000);
        expect(simInputs.maxAttempts).toBe(EMPIRICAL_MAX_ATTEMPTS);
        expect(simInputs.discounts).toStrictEqual(inputs.discounts);
        expect(simInputs.copyAccounts).toBe(3);
        expect(simInputs.evalDayPolicy).toBe(policy);
        expect(simInputs.fundedDayPolicy).toBe(policy);
    });

    it('keeps retrying busted evals until one passes, so every trial reaches the funded phase', () => {
        const swingPolicy: DayPolicy = { ...policy, ladder: [1000] };
        const out = simulate(
            empiricalSimInputs(
                {
                    ...inputs,
                    fundedHorizonDays: 5,
                    maxEvalDays: 60,
                    trials: 200,
                },
                plan,
                { evalDayPolicy: swingPolicy, fundedDayPolicy: policy },
            ),
        );
        expect(out.expectedAttempts).toBeGreaterThan(1);
        expect(out.evalPassProbability).toBe(1);
    }, 60_000);

    it('compares the DP rate per account slot, so the copy count does not show up as a gap', () => {
        const base = simulate({
            fundedHorizonDays: 20,
            maxEvalDays: 30,
            plan: apexEodPlan(),
            riskPerTrade: 250,
            rrRatio: 2,
            seed: 1,
            tradesPerDay: 4,
            trials: 20,
            winrate: 0.5,
        });
        const threeCopies: SimOutputs = {
            ...base,
            expectedHorizonCredit: 3 * 400,
            expectedMonthlyNet: 3 * 1000,
        };
        const lines = empiricalSummaryLines(threeCopies, 1000, 3);
        expect(lines).toContain(
            'expected monthly net per account slot: $1,000',
        );
        expect(lines).toContain('expected horizon credit per cycle: $400');
        expect(lines).toContain('gap vs DP-predicted monthly rate: $0');
    });
});

async function capturedRun(argv: string[]): Promise<{
    exitCode: typeof process.exitCode;
    stderr: string;
    stdout: string;
}> {
    const written: string[] = [];
    const writtenError: string[] = [];
    const write = vi
        .spyOn(process.stdout, 'write')
        .mockImplementation((chunk: string | Uint8Array) => {
            written.push(String(chunk));
            return true;
        });
    const writeError = vi
        .spyOn(process.stderr, 'write')
        .mockImplementation((chunk: string | Uint8Array) => {
            writtenError.push(String(chunk));
            return true;
        });
    const exitCode = process.exitCode;
    let runExitCode: typeof process.exitCode;
    process.exitCode = undefined;
    try {
        await optimizeDp.run?.({
            args: parseArgs<typeof dpArguments>(argv, dpArguments),
            cmd: optimizeDp,
            rawArgs: argv,
        });
    } finally {
        runExitCode = process.exitCode;
        write.mockRestore();
        writeError.mockRestore();
        process.exitCode = exitCode;
    }
    return {
        exitCode: runExitCode,
        stderr: writtenError.join(''),
        stdout: written.join(''),
    };
}

function mockSolveStatus(status: RateSearchStatus): void {
    vi.mocked(solveAverageRewardPolicy).mockImplementationOnce((config) => ({
        ...solveAverageRewardPolicy(config),
        status,
    }));
}

describe('optimize dp run() exits 1 with the existing warning when the rate search hits the --iterations cap (N-73)', () => {
    const smallArgv = [
        '--firm',
        'mffu',
        '--variant',
        'rapid-eod',
        '--eval-days',
        '2',
        '--funded-days',
        '2',
        '--iterations',
        '1',
        '--trials',
        '10',
    ];

    it('sets exit code 1 and warns that the rate search did not converge, pointing at --iterations', async () => {
        mockSolveStatus(RateSearchStatus.SolveCapReached);

        const { exitCode, stdout } = await capturedRun(smallArgv);

        expect(exitCode).toBe(1);
        expect(stdout).toContain(
            'rate search did not converge (status=solve-cap-reached, unconverged funded levels=0), so treat the numbers above as unreliable; consider raising --iterations.',
        );
    }, 600_000);

    it('leaves the exit code unset and prints no such warning when the rate search converges', async () => {
        mockSolveStatus(RateSearchStatus.Converged);

        const { exitCode, stdout } = await capturedRun(smallArgv);

        expect(exitCode).toBeUndefined();
        expect(stdout).not.toContain('rate search did not converge');
    }, 600_000);
});

describe('optimize dp discloses the coarse cycle-baseline rounding (R1-7, U1)', () => {
    it('names the rounding, its conservative bias within the grid, and the opposite bias above the grid top when the baseline grid turns coarse', () => {
        expect(
            fundedCycleBaselineGapWarning(topStepNoFeeStandardPlan(), {
                cycleBaselineRounding: {
                    coarseFromDollars: 2000,
                    coarseStepDollars: 5000,
                    topDollars: 12_000,
                },
            }),
        ).toBe(
            '$50K · No-fee path · Standard XFA: this DP tracks the balance left after each payout on a grid that turns coarse past its fine range (cycleBaselineFineRangeMultiple): from $2,000 above the locked payout floor it steps by $5,000 and rounds a post-payout balance up to the next step, up to the grid top at $12,000 above that floor. Within the grid, rounding up can only understate the profit the DP counts toward the next payout, never overstate it: a conservative bias toward smaller or later payouts. A post-payout balance above the grid top, which the cushion grid also truncates, is clamped down to the top level instead, so there the DP can overstate that profit. The empirical run below tracks the exact balance.',
        );
    });

    it('says nothing when the whole baseline grid is on the fine step', () => {
        expect(
            fundedCycleBaselineGapWarning(topStepNoFeeStandardPlan(), {
                cycleBaselineRounding: null,
            }),
        ).toBeNull();
    });

    it('prints the warning from run() after the solve, with the rounding the funded solve reported', async () => {
        vi.mocked(solveAverageRewardPolicy).mockImplementationOnce((config) => {
            const solution = solveAverageRewardPolicy(config);
            return {
                ...solution,
                fundedResult: {
                    ...solution.fundedResult,
                    cycleBaselineRounding: {
                        coarseFromDollars: 2000,
                        coarseStepDollars: 5000,
                        topDollars: 12_000,
                    },
                },
            };
        });
        const { stdout } = await capturedRun([
            '--firm',
            'mffu',
            '--variant',
            'rapid-eod',
            '--eval-days',
            '2',
            '--funded-days',
            '2',
            '--iterations',
            '1',
            '--trials',
            '10',
        ]);

        expect(stdout).toContain(
            'this DP tracks the balance left after each payout on a grid that turns coarse past its fine range (cycleBaselineFineRangeMultiple): from $2,000 above the locked payout floor it steps by $5,000 and rounds a post-payout balance up to the next step, up to the grid top at $12,000 above that floor.',
        );
        expect(stdout).toContain(
            'A post-payout balance above the grid top, which the cushion grid also truncates, is clamped down to the top level instead, so there the DP can overstate that profit.',
        );
        expect(stdout.indexOf('funded value iteration:')).toBeLessThan(
            stdout.indexOf('turns coarse past its fine range'),
        );
    }, 600_000);
});

describe('optimize dp discloses how it bundles copy-traded renewals (U16)', () => {
    const tradeifyGrowthArgv = ['--firm', 'tradeify', '--variant', 'growth'];

    it('says the DP and its cross-check re-buy every copy together with the bundle discount, unlike the cash-flow timeline', () => {
        const objective = renewalObjective(
            parseDpInputs(['--copy-accounts=5']),
            resolvedDpPlan(tradeifyGrowthArgv),
        );

        expect(bundleRenewalNote(objective)).toBe(
            "$50K · Growth: with 5 copy-traded accounts, this DP and its simulate() cross-check re-buy all of them together at every renewal and apply the 5.0% bundle discount to each renewal cycle's first eval fee and activation fee. The cash-flow timeline instead runs each account slot on its own and gives the bundle discount only to each slot's first purchase, so the two differ on repeat purchases. Which one matches the firm's checkout for a re-purchase is an open question.",
        );
    });

    it('says nothing for a single account or a plan without a bundle discount', () => {
        const tradeifyGrowth = resolvedDpPlan(tradeifyGrowthArgv);
        const singleAccount = renewalObjective(
            parseDpInputs([]),
            tradeifyGrowth,
        );
        const noBundlePlan = renewalObjective(
            parseDpInputs(['--copy-accounts=5']),
            topStepNoFeeStandardPlan(),
        );

        expect(bundleRenewalNote(singleAccount)).toBeNull();
        expect(bundleRenewalNote(noBundlePlan)).toBeNull();
    });

    it('prints the note from run() before the solve starts', async () => {
        vi.mocked(solveAverageRewardPolicy).mockImplementationOnce(() => {
            throw new Error('stop after the preamble');
        });
        const { stdout } = await capturedRun([
            ...tradeifyGrowthArgv,
            '--copy-accounts',
            '5',
        ]);

        expect(stdout).toContain(
            'this DP and its simulate() cross-check re-buy all of them together at every renewal',
        );
    });
});

describe('optimize dp --eval-discount help says it also prices every re-buy (N-47, T9)', () => {
    it('states that the percentage applies to the first purchase and to every re-buy', () => {
        expect(dpArguments['eval-discount'].description).toBe(
            'Coupon discount percent [0,100] off the evaluation fee. It prices the first purchase and every re-buy after a failed attempt alike, so a code whose repeat purchase costs more than its first purchase (e.g. FundedNext RAPID) under-prices each retry; prop plans prints the firm notes',
        );
    });
});

const warmUpArgv = [
    '--firm',
    'mffu',
    '--variant',
    'rapid-eod',
    '--eval-days',
    '2',
    '--funded-days',
    '2',
    '--iterations',
    '1',
    '--trials',
    '10',
];

describe('optimize dp run() awaits the firm registry warm-up before its first solve, whatever ran before it (N-63)', () => {
    it('finishes the warm-up before the first solve starts, even when the warm-up is slower than the solver setup', async () => {
        const events: string[] = [];
        vi.mocked(warmFirmsRegistryCache).mockImplementationOnce(async () => {
            await new Promise((resolve) => setTimeout(resolve, 50));
            events.push('warm-up finished');
            return null;
        });
        vi.mocked(solveAverageRewardPolicy).mockImplementationOnce(() => {
            events.push('first solve started');
            throw new Error('stop at the first solve');
        });

        await capturedRun(warmUpArgv);

        expect(events).toStrictEqual([
            'warm-up finished',
            'first solve started',
        ]);
    });

    it('resolves the warm-up to null once the registry has loaded', async () => {
        await expect(warmFirmsRegistryCache()).resolves.toBeNull();
    });

    it('warns on stderr that the solve falls back to one thread when the warm-up fails, and still solves', async () => {
        vi.mocked(warmFirmsRegistryCache).mockResolvedValueOnce(
            new Error('registry import failed'),
        );
        vi.mocked(solveAverageRewardPolicy).mockClear();
        vi.mocked(solveAverageRewardPolicy).mockImplementationOnce(() => {
            throw new Error('stop at the first solve');
        });

        const { stderr } = await capturedRun(warmUpArgv);

        expect(stderr).toContain(
            registryWarmUpFailureWarning(new Error('registry import failed')),
        );
        expect(vi.mocked(solveAverageRewardPolicy)).toHaveBeenCalledOnce();
    });

    it('names the warm-up error and says the results are unchanged, only slower', () => {
        expect(
            registryWarmUpFailureWarning(new Error('registry import failed')),
        ).toBe(
            'the firm registry warm-up failed (registry import failed), so this solve falls back to one thread: the results are unchanged, it only runs slower',
        );
    });
});

describe('optimize dp funded solve keeps the WP17c shared day skeleton and day-close cache (N-63)', () => {
    it('computes at most 630 day-close outcomes and at most 47 skeleton risk lists over 10+ sweeps of a small MFF Rapid EOD grid, bounding the shared day skeleton and day-close cache instead of pinning their exact call counts (WP58c, N-86 stage 2: the coarse cushion tail is on by default now, so reachedStateCount moved from 210 to 546 and both cache bounds moved with it (260 to 630, 30 to 47); the earlier without-caching comparison figures (330, 932, 148) are stale under the new grid and are not re-verified here)', () => {
        const plan = resolvedDpPlan([
            '--firm',
            'mffu',
            '--variant',
            'rapid-eod',
        ]).withOverrides({});
        expect(findRegistryPlanId(plan)).toBeNull();
        const dayCloses = vi.spyOn(plan, 'recordDayClosePeak');
        const riskLists = vi.spyOn(plan, 'affordableRoom');

        const result = computeFundedStateValue({
            actionStepMultiple: 1,
            cushionStepMultiple: 1,
            dayCost: 5,
            evalInitialValue: 0,
            feePerAttempt: dollars(0),
            maxActionMultiple: 1,
            meanHorizonDays: 100,
            payoutRegimeCap: 0,
            plan,
            rrRatio: 2,
            tradesPerDay: 1,
            winrate: 0.4,
        });

        expect(result.workerCount).toBe(0);
        expect(result.reachedStateCount).toBe(546);
        expect(result.sweepCount).toBeGreaterThanOrEqual(10);
        expect(dayCloses.mock.calls.length).toBeLessThanOrEqual(630);
        expect(riskLists.mock.calls.length).toBeLessThanOrEqual(47);
    });
});
