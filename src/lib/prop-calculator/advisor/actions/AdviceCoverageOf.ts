import { AccountReconstruction } from '~/lib/prop-calculator/advisor/AccountReconstruction';
import { type AccountSnapshotInput } from '~/lib/prop-calculator/advisor/AccountSnapshotInput';
import { AccountSubstate } from '~/lib/prop-calculator/advisor/AccountSubstate';
import { type Advice } from '~/lib/prop-calculator/advisor/Advice';
import { AssumptionKind } from '~/lib/prop-calculator/advisor/AssumptionKind';
import { createSizingAdvisor, InstantFundedEvalAdvisorError } from '~/lib/prop-calculator/advisor/createSizingAdvisor';
import { DashboardBalanceConvention } from '~/lib/prop-calculator/advisor/DashboardBalanceConvention';
import { ReconstructedLiveKind } from '~/lib/prop-calculator/advisor/ReconstructedAccount';
import { DEFAULT_RULEBOOK } from '~/lib/prop-calculator/advisor/Rulebook';
import { SizingStage } from '~/lib/prop-calculator/advisor/SizingStage';
import { dollars, type Plan } from '~/lib/prop-calculator/core';

export enum AdviceCoverageOutcomeKind {
    Advice = 'advice',
    Unsupported = 'unsupported',
}

export enum AdviceCoverageUnsupportedReason {
    InstantFundedNoEval = 'instant-funded-no-eval',
    LiveNotModeled = 'live-not-modeled',
    Suspended = 'suspended',
}

export type AdviceCoverageOutcome =
    | { readonly advice: Advice; readonly kind: AdviceCoverageOutcomeKind.Advice }
    | {
          readonly kind: AdviceCoverageOutcomeKind.Unsupported;
          readonly reason: AdviceCoverageUnsupportedReason;
      };

export function adviceCoverageOf(
    plan: Plan,
    stage: SizingStage,
    substate: AccountSubstate,
    today: string,
): AdviceCoverageOutcome {
    if (substate === AccountSubstate.Suspended) {
        return {
            kind: AdviceCoverageOutcomeKind.Unsupported,
            reason: AdviceCoverageUnsupportedReason.Suspended,
        };
    }
    const snapshot = coverageSnapshotFor(plan, stage, substate, today);
    const reconstructed = AccountReconstruction.rebuild(snapshot, plan);
    let advisor;
    try {
        advisor = createSizingAdvisor(reconstructed, {
            rulebook: DEFAULT_RULEBOOK,
            snapshotAsOf: today,
            today,
        });
    } catch (error) {
        if (error instanceof InstantFundedEvalAdvisorError) {
            return {
                kind: AdviceCoverageOutcomeKind.Unsupported,
                reason: AdviceCoverageUnsupportedReason.InstantFundedNoEval,
            };
        }
        throw error;
    }
    const advice = advisor.assemble([]);
    if (reconstructed.kind === ReconstructedLiveKind.Live) {
        const isLiveNotModeled = reconstructed.assumptions.some(
            (assumption) => assumption.kind === AssumptionKind.LiveNotModeled,
        );
        if (isLiveNotModeled || advice.documented === null) {
            return {
                kind: AdviceCoverageOutcomeKind.Unsupported,
                reason: AdviceCoverageUnsupportedReason.LiveNotModeled,
            };
        }
    }
    return { advice, kind: AdviceCoverageOutcomeKind.Advice };
}

function coverageFundedInitialState(plan: Plan) {
    const state = plan.initialState();
    plan.beginFundedPhase(state);
    return state;
}

function coverageLiveSnapshotFor(
    plan: Plan,
    substate: AccountSubstate,
    today: string,
): AccountSnapshotInput {
    const base: AccountSnapshotInput = {
        asOf: today,
        balance: dollars(plan.accountSize),
        dashboardConvention: DashboardBalanceConvention.Nominal,
        dashboardFloor: dollars(plan.accountSize * 0.9),
        highestEodBalance: dollars(plan.accountSize),
        highestIntradayBalance: dollars(plan.accountSize),
        liveStartBalance: dollars(plan.accountSize),
        stage: SizingStage.Live,
    };
    switch (substate) {
        case AccountSubstate.Fresh:
        case AccountSubstate.Suspended: {
            return base;
        }
        case AccountSubstate.InProfit:
        case AccountSubstate.PayoutReady:
        case AccountSubstate.PostPayout: {
            const balance = dollars(plan.accountSize * 1.05);
            return {
                ...base,
                balance,
                highestEodBalance: balance,
                highestIntradayBalance: balance,
            };
        }
        case AccountSubstate.NearFloor: {
            return { ...base, balance: dollars(plan.accountSize * 0.91) };
        }
    }
}

function coverageSnapshotFor(
    plan: Plan,
    stage: SizingStage,
    substate: AccountSubstate,
    today: string,
): AccountSnapshotInput {
    if (stage === SizingStage.Live) {
        return coverageLiveSnapshotFor(plan, substate, today);
    }
    const initial =
        stage === SizingStage.Funded
            ? coverageFundedInitialState(plan)
            : plan.initialState();
    const cushion0 = Math.max(50, initial.balance - initial.threshold);
    const base: AccountSnapshotInput = {
        asOf: today,
        balance: dollars(initial.balance),
        dashboardConvention: DashboardBalanceConvention.Nominal,
        highestEodBalance: dollars(initial.balance),
        highestIntradayBalance: dollars(initial.balance),
        stage,
        ...(stage === SizingStage.Funded && {
            firstFundedTradeOn: '2020-01-01',
            fundedOn: '2020-01-01',
        }),
    };
    switch (substate) {
        case AccountSubstate.Fresh: {
            return base;
        }
        case AccountSubstate.InProfit: {
            const bump = cushion0 * 0.2;
            return {
                ...base,
                balance: dollars(initial.balance + bump),
                highestEodBalance: dollars(initial.balance + bump),
                highestIntradayBalance: dollars(initial.balance + bump),
            };
        }
        case AccountSubstate.NearFloor: {
            const bump = Math.max(10, cushion0 * 0.02);
            return {
                ...base,
                balance: dollars(initial.threshold + bump),
            };
        }
        case AccountSubstate.PayoutReady: {
            const bump = Math.max(200, cushion0 * 0.6);
            return {
                ...base,
                balance: dollars(initial.balance + bump),
                firstFundedTradeOn: '2000-01-01',
                fundedOn: '2000-01-01',
                highestEodBalance: dollars(initial.balance + bump),
                highestIntradayBalance: dollars(initial.balance + bump),
                qualifyingDaysSinceLastPayout: 9999,
                tradingDays: 9999,
            };
        }
        case AccountSubstate.PostPayout: {
            const bump = cushion0 * 0.3;
            return {
                ...base,
                balance: dollars(initial.balance + bump * 0.3),
                balanceAtLastPayout: dollars(initial.balance + bump),
                cumulativePayout: dollars(bump * 0.5),
                highestEodBalance: dollars(initial.balance + bump),
                highestIntradayBalance: dollars(initial.balance + bump),
                payoutsTaken: 1,
            };
        }
        case AccountSubstate.Suspended: {
            return base;
        }
    }
}
