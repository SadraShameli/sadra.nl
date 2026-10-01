import {
    type Dollars,
    dollars,
    floorToWholeCents,
    fundedStartContractLimit,
    type InstrumentSymbol,
    isAtOrBelowWithinCentTolerance,
    isBelowOneContract,
    ONE_CENT,
    oneContractRisk,
    type PlacedFundedRisk,
    placedFundedRiskAt,
    resolvePositionSizing,
    TradingPhase,
} from '~/lib/prop-calculator/core';

import { createDocumentedRule } from './createDocumentedRule';
import { documentedRung } from './DocumentedRule';
import {
    type CappedAmount,
    type DailyProfitCap,
    DailyProfitCapKind,
    type DocumentedRung,
    type DocumentedSizing,
    type SizingConstraint,
} from './DocumentedSizing';
import { fundedConsistencyCeiling } from './FundedSizingAdvisor';
import { NO_PERSONAL_CAPS, type PersonalCaps } from './PersonalCaps';
import {
    type ReconstructedAccount,
    type ReconstructedFundedOrEvalAccount,
    ReconstructedLiveKind,
} from './ReconstructedAccount';
import { type RulebookParameters } from './Rulebook';
import { type RuleContext, ruleContextAt } from './RuleContext';
import { assertSizingInvariant } from './SizingInvariant';
import { SizingStage } from './SizingStage';

export enum CopyGroupSizingRejectionKind {
    LiveNotModeled = 'live-not-modeled',
    MixedStage = 'mixed-stage',
    NoCushionRoom = 'no-cushion-room',
    NoMembers = 'no-members',
}

export enum CopyGroupSizingResultKind {
    Rejected = 'rejected',
    Sized = 'sized',
}

export interface CopyGroupContractPlacement {
    readonly contracts: number;
    readonly isRefused: boolean;
    readonly members: readonly CopyGroupMemberContractPlacement[];
    readonly riskPerContract: Dollars;
}

export interface CopyGroupDivergence {
    readonly groupRisk: Dollars;
    readonly memberId: string;
    readonly memberLabel: string;
    readonly ownRisk: Dollars;
    readonly rungIndex: number;
}

export interface CopyGroupMemberContractPlacement {
    readonly contractLimit: null | number;
    readonly isBelowOneContract: boolean;
    readonly memberId: string;
    readonly placed: PlacedFundedRisk;
}

export interface CopyGroupSizingInput {
    readonly members: readonly CopyGroupSizingMember[];
    readonly positionSizing?: null | {
        readonly instrument: InstrumentSymbol;
        readonly stopPoints: number;
    };
    readonly rulebook: RulebookParameters;
}

export interface CopyGroupSizingMember {
    readonly account: ReconstructedAccount;
    readonly id: string;
    readonly label: string;
    readonly personalCaps?: PersonalCaps;
    readonly personalDll?: Dollars | null;
}

export type CopyGroupSizingRejection =
    | {
          readonly kind: CopyGroupSizingRejectionKind.LiveNotModeled;
          readonly message: string;
      }
    | {
          readonly kind: CopyGroupSizingRejectionKind.MixedStage;
          readonly message: string;
          readonly stages: readonly SizingStage[];
      }
    | {
          readonly kind: CopyGroupSizingRejectionKind.NoCushionRoom;
          readonly memberIds: readonly string[];
          readonly message: string;
      }
    | {
          readonly kind: CopyGroupSizingRejectionKind.NoMembers;
          readonly message: string;
      };

export type CopyGroupSizingResult =
    | {
          readonly contractPlacement: CopyGroupContractPlacement | null;
          readonly divergences: readonly CopyGroupDivergence[];
          readonly kind: CopyGroupSizingResultKind.Sized;
          readonly memberIds: readonly string[];
          readonly sizing: DocumentedSizing;
          readonly stage: SizingStage.Eval | SizingStage.Funded;
      }
    | {
          readonly kind: CopyGroupSizingResultKind.Rejected;
          readonly rejection: CopyGroupSizingRejection;
      };

const CENT_TOLERANCE = 0.005;

export interface DocumentedSizingOf {
    readonly context: RuleContext;
    readonly sizing: DocumentedSizing;
}

export interface DocumentedSizingOfOptions {
    readonly instrument?: InstrumentSymbol | null;
    readonly personalCaps?: PersonalCaps;
    readonly personalDll?: Dollars | null;
}

export function copyGroupSizing(
    input: CopyGroupSizingInput,
): CopyGroupSizingResult {
    const { members, positionSizing, rulebook } = input;
    if (members.length === 0) {
        return rejected({
            kind: CopyGroupSizingRejectionKind.NoMembers,
            message: 'A copy group needs at least one member to be sized.',
        });
    }
    const stages = [...new Set(members.map((member) => stageOf(member.account)))];
    if (stages.length > 1) {
        return rejected({
            kind: CopyGroupSizingRejectionKind.MixedStage,
            message:
                'Every member of a copy group must be in one stage before it can be sized; group sizing needs one stage.',
            stages,
        });
    }
    const [stage] = stages;
    if (stage === undefined || stage === SizingStage.Live) {
        return rejected({
            kind: CopyGroupSizingRejectionKind.LiveNotModeled,
            message:
                'Copy-group sizing is not modeled for live accounts yet.',
        });
    }
    const resolvedPositionSizing = positionSizing
        ? resolvePositionSizing(positionSizing.instrument, positionSizing.stopPoints)
        : null;
    const entries = members.map((member) => {
        const { account } = member;
        if (account.kind === ReconstructedLiveKind.Live) {
            throw new Error(
                'copy-group sizing expected a non-live account after stage validation',
            );
        }
        const { context, sizing } = documentedSizingOf(account, rulebook, {
            instrument: positionSizing?.instrument ?? null,
            personalCaps: personalCapsFromAccount(account, member.personalCaps),
            personalDll: member.personalDll ?? null,
        });
        return { account, context, member, sizing };
    });

    const [firstEntry] = entries;
    if (firstEntry === undefined) {
        throw new Error('copy-group sizing expected at least one member');
    }
    const noCushionRoomMemberIds = entries
        .filter((entry) => entry.sizing.rungs.length === 0)
        .map((entry) => entry.member.id);
    if (noCushionRoomMemberIds.length > 0) {
        return rejected({
            kind: CopyGroupSizingRejectionKind.NoCushionRoom,
            memberIds: noCushionRoomMemberIds,
            message:
                'A copy group cannot be sized while a member has no cushion room left.',
        });
    }
    const groupRungCount = Math.min(
        ...entries.map((entry) => entry.sizing.rungs.length),
    );
    const rewardMultiple = firstEntry.sizing.rewardMultiple;
    const rungs: DocumentedRung[] = [];
    let runningLoss = 0;
    for (let index = 0; index < groupRungCount; index++) {
        const candidates = entries.map((entry) =>
            rungAtOrThrow(entry.sizing, index),
        );
        const risk = Math.min(...candidates.map((rung) => rung.risk));
        const cappedBy = new Set<SizingConstraint>();
        for (const rung of candidates) {
            for (const constraint of rung.cappedBy) {
                cappedBy.add(constraint);
            }
        }
        const rung = documentedRung(
            floorToWholeCents(risk),
            runningLoss,
            rewardMultiple,
            [...cappedBy],
        );
        rungs.push(rung);
        runningLoss = rung.runningLossAfter;
    }

    const constraints = [
        ...new Set(entries.flatMap((entry) => entry.sizing.constraints)),
    ];
    const dailyProfitCap = tighterDailyProfitCap(
        entries.map((entry) => entry.sizing.dailyProfitCap),
    );
    const profitCeiling = tighterCappedAmount(
        entries.map((entry) => entry.sizing.profitCeiling),
    );
    const sizing: DocumentedSizing = {
        assumptions: [
            ...new Set(entries.flatMap((entry) => entry.sizing.assumptions)),
        ],
        constraints,
        dailyProfitCap,
        maxTrades: Math.min(...entries.map((entry) => entry.sizing.maxTrades)),
        minStopPointsAtCap: null,
        profitCeiling,
        provenance: firstEntry.sizing.provenance,
        rewardMultiple,
        rungs,
        sources: [...new Set(entries.flatMap((entry) => entry.sizing.sources))],
        stopRule: firstEntry.sizing.stopRule,
    };

    for (const entry of entries) {
        assertSizingInvariant(sizing, entry.context);
    }

    const divergences = divergencesOf(entries, sizing);
    const groupRisk = sizing.rungs[0]?.risk ?? null;
    const contractPlacement =
        groupRisk !== null &&
        resolvedPositionSizing !== null &&
        stage === SizingStage.Funded
            ? contractPlacementOf(entries, resolvedPositionSizing, groupRisk)
            : null;

    return {
        contractPlacement,
        divergences,
        kind: CopyGroupSizingResultKind.Sized,
        memberIds: members.map((member) => member.id),
        sizing,
        stage,
    };
}

export function documentedSizingOf(
    account: ReconstructedFundedOrEvalAccount,
    rulebook: RulebookParameters,
    options: DocumentedSizingOfOptions = {},
): DocumentedSizingOf {
    const stage = stageOfPhase(account.kind);
    const personalCaps =
        options.personalCaps ?? personalCapsFromAccount(account);
    const context = ruleContextFor(
        account,
        stage,
        personalCaps,
        options.instrument ?? null,
        options.personalDll ?? null,
    );
    const sizing = createDocumentedRule(stage, rulebook).size(context);
    return { context, sizing };
}

export function personalCapsFromAccount(
    account: ReconstructedFundedOrEvalAccount,
    override?: PersonalCaps,
): PersonalCaps {
    if (override) return override;
    const { personalMaxRiskPerTrade } = account;
    return personalMaxRiskPerTrade
        ? {
              ...NO_PERSONAL_CAPS,
              maxRiskPerTrade: dollars(personalMaxRiskPerTrade),
          }
        : NO_PERSONAL_CAPS;
}

function contractPlacementOf(
    entries: readonly {
        readonly account: ReconstructedFundedOrEvalAccount;
        readonly member: CopyGroupSizingMember;
    }[],
    positionSizing: NonNullable<ReturnType<typeof resolvePositionSizing>>,
    groupRisk: Dollars,
): CopyGroupContractPlacement {
    const members = entries.map((entry) => {
        const placed = placedFundedRiskAt(
            groupRisk,
            positionSizing,
            entry.account.plan,
        );
        return {
            contractLimit: fundedStartContractLimit(
                entry.account.plan,
                positionSizing,
            ),
            isBelowOneContract: isBelowOneContract(groupRisk, positionSizing),
            memberId: entry.member.id,
            placed,
        };
    });
    const contracts = Math.min(...members.map((entry) => entry.placed.contracts));
    return {
        contracts,
        isRefused: contracts <= 0,
        members,
        riskPerContract: dollars(oneContractRisk(positionSizing)),
    };
}

function divergencesOf(
    entries: readonly {
        readonly member: CopyGroupSizingMember;
        readonly sizing: DocumentedSizing;
    }[],
    groupSizing: DocumentedSizing,
): readonly CopyGroupDivergence[] {
    const divergences: CopyGroupDivergence[] = [];
    for (const entry of entries) {
        const divergence = firstDivergenceOf(entry, groupSizing);
        if (divergence !== null) divergences.push(divergence);
    }
    return divergences;
}

function firstDivergenceOf(
    entry: {
        readonly member: CopyGroupSizingMember;
        readonly sizing: DocumentedSizing;
    },
    groupSizing: DocumentedSizing,
): CopyGroupDivergence | null {
    for (const [index, groupRung] of groupSizing.rungs.entries()) {
        const ownRung = entry.sizing.rungs[index];
        if ((ownRung === undefined) || isAtOrBelowWithinCentTolerance(
                Math.abs(ownRung.risk - groupRung.risk),
                CENT_TOLERANCE,
            )) {
            continue;
        }
        return {
            groupRisk: groupRung.risk,
            memberId: entry.member.id,
            memberLabel: entry.member.label,
            ownRisk: ownRung.risk,
            rungIndex: index,
        };
    }
    return null;
}

function rejected(
    rejection: CopyGroupSizingRejection,
): CopyGroupSizingResult {
    return { kind: CopyGroupSizingResultKind.Rejected, rejection };
}

function ruleContextFor(
    account: ReconstructedFundedOrEvalAccount,
    stage: SizingStage.Eval | SizingStage.Funded,
    personalCaps: PersonalCaps,
    instrument: InstrumentSymbol | null,
    personalDll: Dollars | null,
): RuleContext {
    const placeableMinimum = ONE_CENT;
    switch (stage) {
        case SizingStage.Eval: {
            return ruleContextAt(account.plan, SizingStage.Eval, account.state, {
                ceiling: null,
                instrument,
                personalCaps,
                personalDll,
                placeableMinimum,
            });
        }
        case SizingStage.Funded: {
            return ruleContextAt(
                account.plan,
                SizingStage.Funded,
                account.state,
                {
                    ceiling: fundedConsistencyCeiling(account),
                    instrument,
                    personalCaps,
                    personalDll,
                    placeableMinimum,
                },
            );
        }
    }
}

function rungAtOrThrow(
    sizing: DocumentedSizing,
    index: number,
): DocumentedRung {
    const rung = sizing.rungs[index];
    if (rung === undefined) {
        throw new Error(`copy-group sizing expected rung ${index + 1} to exist`);
    }
    return rung;
}

function stageOf(account: ReconstructedAccount): SizingStage {
    return account.kind === ReconstructedLiveKind.Live
        ? SizingStage.Live
        : stageOfPhase(account.kind);
}

function stageOfPhase(
    phase: TradingPhase.Eval | TradingPhase.Funded,
): SizingStage.Eval | SizingStage.Funded {
    return phase === TradingPhase.Eval ? SizingStage.Eval : SizingStage.Funded;
}

function tighterCappedAmount(
    candidates: readonly (CappedAmount | null)[],
): CappedAmount | null {
    let tightest: CappedAmount | null = null;
    for (const candidate of candidates) {
        if (candidate === null) continue;
        if (tightest === null || candidate.amount < tightest.amount) {
            tightest = candidate;
        }
    }
    return tightest;
}

function tighterDailyProfitCap(
    candidates: readonly (DailyProfitCap | null)[],
): DailyProfitCap | null {
    let tightest: DailyProfitCap | null = null;
    for (const candidate of candidates) {
        if (candidate === null) continue;
        if (tightest === null) {
            tightest = candidate;
            continue;
        }
        const tightestAmount =
            tightest.kind === DailyProfitCapKind.HardCeiling
                ? tightest.ceiling
                : tightest.stopAfter;
        const candidateAmount =
            candidate.kind === DailyProfitCapKind.HardCeiling
                ? candidate.ceiling
                : candidate.stopAfter;
        if (candidateAmount < tightestAmount) tightest = candidate;
    }
    return tightest;
}
