import { type UsdCents, usdCentsFromDollars } from '~/lib/prop-accounts/core';
import {
    CENTS_PER_DOLLAR,
    type Plan,
    TradingPhase,
} from '~/lib/prop-calculator';
import {
    type ReconstructedAccount,
    type ReconstructedFundedOrEvalAccount,
    type ReconstructedLiveAccount,
    ReconstructedLiveKind,
    type RetainedCushionBasis,
    retainedCushionForStage,
    type RulebookParameters,
    SizingStage,
} from '~/lib/prop-calculator/advisor';

import {
    type AccountStateEntry,
    AccountStateKind,
    type AccountStateUnavailableReason,
} from './AccountStates';

export enum CushionRatioBasis {
    Eval = 'eval',
    Funded = 'funded',
    Live = 'live',
}

export enum FundedRiskBasis {
    PersonalMaxRiskPerTrade = 'personal-max-risk-per-trade',
    RulebookFunded = 'rulebook-funded',
}

export interface CushionBoard {
    readonly rows: readonly CushionBoardRow[];
    readonly unavailable: readonly CushionBoardUnavailableRow[];
}

export interface CushionBoardRow {
    readonly accountId: string;
    readonly asOf: string;
    readonly cushionCents: null | UsdCents;
    readonly floorCents: null | UsdCents;
    readonly ratio: CushionRatio;
}

export interface CushionBoardUnavailableRow {
    readonly accountId: string;
    readonly reason: AccountStateUnavailableReason;
}

export interface CushionRatio {
    readonly basis: CushionRatioBasis;
    readonly basisAmount: null | number;
    readonly cushion: null | number;
    readonly floor: null | number;
    readonly fundedRiskBasis?: FundedRiskBasis;
    readonly ratio: null | number;
    readonly retainedCushionBasis?: RetainedCushionBasis;
}

export function cushionBoardOf(
    rulebook: RulebookParameters,
    entries: readonly AccountStateEntry[],
): CushionBoard {
    const rows: CushionBoardRow[] = [];
    const unavailable: CushionBoardUnavailableRow[] = [];
    for (const entry of entries) {
        const { state } = entry;
        if (state.kind === AccountStateKind.Unavailable) {
            unavailable.push({
                accountId: entry.accountId,
                reason: state.reason,
            });
            continue;
        }
        const ratio = cushionRatioOf(rulebook, state.latest.reconstructed);
        rows.push({
            accountId: entry.accountId,
            asOf: state.latest.asOf,
            cushionCents:
                ratio.cushion === null
                    ? null
                    : usdCentsFromDollars(ratio.cushion),
            floorCents:
                ratio.floor === null ? null : usdCentsFromDollars(ratio.floor),
            ratio,
        });
    }
    return {
        rows: rows.toSorted(
            (left, right) => rankOf(left.ratio) - rankOf(right.ratio),
        ),
        unavailable,
    };
}

export function cushionRatioOf(
    rulebook: RulebookParameters,
    reconstructed: ReconstructedAccount,
): CushionRatio {
    switch (reconstructed.kind) {
        case ReconstructedLiveKind.Live: {
            return liveRatio(rulebook, reconstructed);
        }
        case TradingPhase.Eval: {
            return evalRatio(reconstructed);
        }
        case TradingPhase.Funded: {
            return fundedRatio(rulebook, reconstructed);
        }
    }
}

export function documentedFundedRiskOf(
    rulebook: RulebookParameters,
): number {
    return rulebook.funded.riskCents / CENTS_PER_DOLLAR;
}

function evalDrawdownAmountOf(plan: Plan): number {
    return plan.drawdownFor(TradingPhase.Eval).amount;
}

function evalRatio(
    account: ReconstructedFundedOrEvalAccount,
): CushionRatio {
    const basisAmount = evalDrawdownAmountOf(account.plan);
    return {
        basis: CushionRatioBasis.Eval,
        basisAmount,
        cushion: account.cushion,
        floor: account.state.threshold,
        ratio: ratioOf(account.cushion, basisAmount),
    };
}

function fundedRatio(
    rulebook: RulebookParameters,
    account: ReconstructedFundedOrEvalAccount,
): CushionRatio {
    const { basis: fundedRiskBasis, basisAmount } = fundedRiskBasisOf(
        rulebook,
        account.personalMaxRiskPerTrade ?? null,
    );
    return {
        basis: CushionRatioBasis.Funded,
        basisAmount,
        cushion: account.cushion,
        floor: account.state.threshold,
        fundedRiskBasis,
        ratio: ratioOf(account.cushion, basisAmount),
    };
}

function fundedRiskBasisOf(
    rulebook: RulebookParameters,
    personalMaxRiskPerTrade: null | number,
): { readonly basis: FundedRiskBasis; readonly basisAmount: number } {
    const documented = documentedFundedRiskOf(rulebook);
    if (
        personalMaxRiskPerTrade !== null &&
        personalMaxRiskPerTrade < documented
    ) {
        return {
            basis: FundedRiskBasis.PersonalMaxRiskPerTrade,
            basisAmount: personalMaxRiskPerTrade,
        };
    }
    return { basis: FundedRiskBasis.RulebookFunded, basisAmount: documented };
}

function liveRatio(
    rulebook: RulebookParameters,
    account: ReconstructedLiveAccount,
): CushionRatio {
    if (account.livePlan === null || account.state === null) {
        return {
            basis: CushionRatioBasis.Live,
            basisAmount: null,
            cushion: account.cushion,
            floor: null,
            ratio: null,
        };
    }
    const { amount: basisAmount, basis: retainedCushionBasis } =
        retainedCushionForStage(rulebook, {
            livePlan: account.livePlan,
            paidPayoutsSinceLastLiveAccount: null,
            personalRequestOverride: null,
            personalRetainedCushion: null,
            stage: SizingStage.Live,
            state: account.state,
        });
    const cushion =
        account.cushion ?? account.state.balance - account.state.threshold;
    return {
        basis: CushionRatioBasis.Live,
        basisAmount,
        cushion,
        floor: account.state.threshold,
        ratio: ratioOf(cushion, basisAmount),
        retainedCushionBasis,
    };
}

function rankOf(ratio: CushionRatio): number {
    return ratio.ratio ?? Infinity;
}

function ratioOf(
    cushion: null | number,
    basisAmount: null | number,
): null | number {
    return cushion === null || basisAmount === null || basisAmount <= 0
        ? null
        : cushion / basisAmount;
}
