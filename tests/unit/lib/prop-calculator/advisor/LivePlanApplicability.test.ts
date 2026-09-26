import { describe, expect, it } from 'vitest';

import {
    AlphaFuturesVariant,
    ApexVariant,
    dollars,
    E8FuturesVariant,
    FirmId,
    FtmoFuturesVariant,
    FundedNextVariant,
    type LiveCushionPercent,
    LucidVariant,
    MffuVariant,
    type PlanId,
    serializePlanId,
    TopStepVariant,
    TradeifyVariant,
} from '~/lib/prop-calculator';
import {
    isLiveModelApproximation,
    LiveApplicabilityKind,
    LiveApplicabilityNote,
    LiveNotModeledReason,
    type LivePlanApplicability,
    livePlanApplicability,
    LiveStateApproximation,
} from '~/lib/prop-calculator/advisor';
import {
    ALL_FIRMS,
    ALPHAFUTURES_LIVE_DEFAULT_CUSHION_PERCENT,
    APEX_LIVE_DEFAULT_CUSHION_PERCENT,
    buildAlphaFuturesLivePlan,
    buildApexLivePlan,
    buildFundedNextLivePlan,
    buildLucidDailyLivePlan,
    buildLucidLivePlan,
    buildMffuRapidLivePlan,
    buildTopStepLivePlan,
    buildTptLivePlan,
    buildTradeifyLivePlan,
    computeTopStepLiveStartingBalance,
    FUNDEDNEXT_LIVE_DEFAULT_CUSHION_PERCENT,
    LIVE_PLAN_BUILDERS,
    type LivePlanBuilder,
    LUCID_LIVE_DEFAULT_CUSHION_PERCENT,
    MFFU_RAPID_LIVE_DEFAULT_CUSHION_PERCENT,
    TOPSTEP_LIVE_DEFAULT_CUSHION_PERCENT,
    TPT_LIVE_DEFAULT_CUSHION_PERCENT,
    TRADEIFY_LIVE_DEFAULT_CUSHION_PERCENT,
} from '~/lib/prop-calculator/firms';

type Expected = [PlanId, LivePlanApplicability];

function builder(
    build: LivePlanBuilder,
    defaultCushionPercent: LiveCushionPercent,
    isVerified: boolean,
    note: LiveApplicabilityNote | null = null,
    approximation: LiveStateApproximation | null = null,
    documentedStart: unknown = null,
): LivePlanApplicability {
    return {
        approximation,
        builder: build,
        defaultCushionPercent,
        documentedStart,
        isVerified,
        kind: LiveApplicabilityKind.Builder,
        note,
    } as LivePlanApplicability;
}

function defaultBuildCushion(
    applicability: LivePlanApplicability,
): LiveCushionPercent | null {
    switch (applicability.kind) {
        case LiveApplicabilityKind.Builder: {
            return applicability.builder(applicability.defaultCushionPercent)
                .cushionPercent;
        }
        case LiveApplicabilityKind.NotModeled: {
            return null;
        }
        case LiveApplicabilityKind.TransitionBuilder: {
            return applicability.transitionBuilder(
                applicability.defaultCushionPercent,
                dollars(0),
            ).cushionPercent;
        }
    }
}

function notModeled(reason: LiveNotModeledReason): LivePlanApplicability {
    return { kind: LiveApplicabilityKind.NotModeled, reason };
}

const LUCID_DAILY: LivePlanApplicability = {
    defaultCushionPercent: LUCID_LIVE_DEFAULT_CUSHION_PERCENT,
    isVerified: true,
    kind: LiveApplicabilityKind.TransitionBuilder,
    note: LiveApplicabilityNote.LucidDailyTransitionPayoutIsPastCash,
    transitionBuilder: buildLucidDailyLivePlan,
};

const TOPSTEP_XFA = builder(
    buildTopStepLivePlan,
    TOPSTEP_LIVE_DEFAULT_CUSHION_PERCENT,
    true,
    LiveApplicabilityNote.TopStepLfaEligibleJurisdictionAssumed,
    LiveStateApproximation.ReserveAndLfaProgressDefaulted,
    expect.any(Function),
);

const SIZE = 50_000;

const EXPECTED_BY_PT04_ITEM_I: readonly Expected[] = [
    ...[ApexVariant.Eod, ApexVariant.Intraday].map((variant): Expected => [
        { accountSize: SIZE, firm: FirmId.Apex, variant },
        builder(
            buildApexLivePlan,
            APEX_LIVE_DEFAULT_CUSHION_PERCENT,
            true,
            LiveApplicabilityNote.ApexUserPasteOnly,
        ),
    ]),
    [
        { accountSize: SIZE, firm: FirmId.Tpt },
        builder(
            buildTptLivePlan,
            TPT_LIVE_DEFAULT_CUSHION_PERCENT,
            true,
            LiveApplicabilityNote.TptDevelopmentOnlyOnPlacement,
        ),
    ],
    ...[
        TradeifyVariant.Growth,
        TradeifyVariant.Lightning,
        TradeifyVariant.SelectDaily,
        TradeifyVariant.SelectFlex,
    ].map((variant): Expected => [
        { accountSize: SIZE, firm: FirmId.Tradeify, variant },
        builder(
            buildTradeifyLivePlan,
            TRADEIFY_LIVE_DEFAULT_CUSHION_PERCENT,
            true,
        ),
    ]),
    ...[
        FundedNextVariant.RapidPro,
        FundedNextVariant.RapidProDllAddOn,
        FundedNextVariant.RapidDaily,
    ].map((variant): Expected => [
        { accountSize: SIZE, firm: FirmId.FundedNext, variant },
        builder(
            buildFundedNextLivePlan,
            FUNDEDNEXT_LIVE_DEFAULT_CUSHION_PERCENT,
            true,
            LiveApplicabilityNote.FundedNextTwoQuoteInference,
        ),
    ]),
    [
        {
            accountSize: SIZE,
            firm: FirmId.FundedNext,
            variant: FundedNextVariant.Flex,
        },
        builder(
            buildFundedNextLivePlan,
            FUNDEDNEXT_LIVE_DEFAULT_CUSHION_PERCENT,
            false,
            LiveApplicabilityNote.FundedNextFlexTriggerConflict,
        ),
    ],
    [
        {
            accountSize: SIZE,
            firm: FirmId.FundedNext,
            variant: FundedNextVariant.Legacy,
        },
        notModeled(LiveNotModeledReason.SeparateLiveProgram),
    ],
    [
        {
            accountSize: SIZE,
            firm: FirmId.FundedNext,
            variant: FundedNextVariant.Fnl003,
        },
        notModeled(LiveNotModeledReason.NoStatedLivePath),
    ],
    ...[
        LucidVariant.Pro,
        LucidVariant.ProNoDll,
        LucidVariant.Flex,
        LucidVariant.FlexDll,
        LucidVariant.Direct,
    ].map((variant): Expected => [
        { accountSize: SIZE, firm: FirmId.Lucid, variant },
        builder(buildLucidLivePlan, LUCID_LIVE_DEFAULT_CUSHION_PERCENT, true),
    ]),
    ...[
        LucidVariant.DailyEod,
        LucidVariant.DailyEodDll,
        LucidVariant.DailyIntraday,
        LucidVariant.DailyIntradayDll,
    ].map((variant): Expected => [
        { accountSize: SIZE, firm: FirmId.Lucid, variant },
        LUCID_DAILY,
    ]),
    [
        { accountSize: SIZE, firm: FirmId.Lucid, variant: LucidVariant.Maxx },
        notModeled(LiveNotModeledReason.AlreadyLive),
    ],
    [
        { accountSize: SIZE, firm: FirmId.Mffu, variant: MffuVariant.Rapid },
        builder(
            buildMffuRapidLivePlan,
            MFFU_RAPID_LIVE_DEFAULT_CUSHION_PERCENT,
            true,
        ),
    ],
    [
        {
            accountSize: SIZE,
            firm: FirmId.Mffu,
            variant: MffuVariant.RapidEod,
        },
        builder(
            buildMffuRapidLivePlan,
            MFFU_RAPID_LIVE_DEFAULT_CUSHION_PERCENT,
            true,
            LiveApplicabilityNote.MffuRapidEodLiveContractLimitDisputed,
        ),
    ],
    ...[MffuVariant.Pro, MffuVariant.Builder].map((variant): Expected => [
        { accountSize: SIZE, firm: FirmId.Mffu, variant },
        notModeled(LiveNotModeledReason.SeparateLiveProgram),
    ]),
    ...[
        TopStepVariant.NoFeeConsistency,
        TopStepVariant.NoFeeConsistencyDll,
        TopStepVariant.NoFeeStandard,
        TopStepVariant.NoFeeStandardDll,
        TopStepVariant.StandardConsistency,
        TopStepVariant.StandardConsistencyDll,
        TopStepVariant.StandardStandard,
        TopStepVariant.StandardStandardDll,
    ].map((variant): Expected => [
        { accountSize: SIZE, firm: FirmId.TopStep, variant },
        TOPSTEP_XFA,
    ]),
    [
        {
            accountSize: SIZE,
            firm: FirmId.TopStep,
            variant: TopStepVariant.ProAccount,
        },
        notModeled(LiveNotModeledReason.TerminalStage),
    ],
    ...[
        AlphaFuturesVariant.Zero,
        AlphaFuturesVariant.Standard,
        AlphaFuturesVariant.Advanced,
    ].map((variant): Expected => [
        { accountSize: SIZE, firm: FirmId.AlphaFutures, variant },
        builder(
            buildAlphaFuturesLivePlan,
            ALPHAFUTURES_LIVE_DEFAULT_CUSHION_PERCENT,
            true,
            LiveApplicabilityNote.AlphaPrimeNotModeled,
        ),
    ]),
    ...Object.values(E8FuturesVariant).map((variant): Expected => [
        { accountSize: SIZE, firm: FirmId.E8Futures, variant },
        notModeled(LiveNotModeledReason.FirmRunsNoLiveProgram),
    ]),
    ...Object.values(FtmoFuturesVariant).map((variant): Expected => [
        { accountSize: SIZE, firm: FirmId.FtmoFutures, variant },
        notModeled(LiveNotModeledReason.LiveTermsUnpublished),
    ]),
];

const REGISTRY_PLANS = ALL_FIRMS.flatMap((firm) => firm.plans);

function bySerial(left: string, right: string): number {
    return left.localeCompare(right);
}

describe('LivePlanApplicability (F-151, PD-41, PT-04 item (i))', () => {
    it.each(
        EXPECTED_BY_PT04_ITEM_I.map(
            ([id, expected]) => [serializePlanId(id), id, expected] as const,
        ),
    )('maps %s as PT-04 item (i) states', (_serial, id, expected) => {
        expect(livePlanApplicability(id)).toEqual(expected);
    });

    it('has an entry for every registry plan and none for a plan the registry lacks', () => {
        const registrySerials = REGISTRY_PLANS.map((plan) =>
            serializePlanId(plan.id),
        ).toSorted(bySerial);
        const expectedSerials = EXPECTED_BY_PT04_ITEM_I.map(([id]) =>
            serializePlanId(id),
        ).toSorted(bySerial);

        expect(expectedSerials).toEqual(registrySerials);
        for (const plan of REGISTRY_PLANS) {
            expect(() => livePlanApplicability(plan.id)).not.toThrow();
        }
    });

    it('never maps a plan to a builder its firm does not own', () => {
        for (const plan of REGISTRY_PLANS) {
            const applicability = livePlanApplicability(plan.id);
            if (applicability.kind !== LiveApplicabilityKind.Builder) continue;
            expect(LIVE_PLAN_BUILDERS.get(plan.id.firm)).toBe(
                applicability.builder,
            );
        }
    });

    it('builds the TopStep LFA from the 50K default, whose start is always computeTopStepLiveStartingBalance', () => {
        const applicability = livePlanApplicability({
            accountSize: SIZE,
            firm: FirmId.TopStep,
            variant: TopStepVariant.StandardStandard,
        });
        if (applicability.kind !== LiveApplicabilityKind.Builder) {
            throw new Error('TopStep XFA must map to a live builder');
        }

        expect(
            applicability.builder(TOPSTEP_LIVE_DEFAULT_CUSHION_PERCENT)
                .startingBalance,
        ).toBe(computeTopStepLiveStartingBalance(dollars(SIZE), dollars(SIZE)));
    });

    it('carries the documented TopStep LFA start range on its entry and no range on any other entry', () => {
        for (const plan of REGISTRY_PLANS) {
            const applicability = livePlanApplicability(plan.id);
            const range =
                applicability.kind === LiveApplicabilityKind.Builder
                    ? applicability.documentedStart?.(plan.accountSize)
                    : undefined;
            if (
                plan.id.firm === FirmId.TopStep &&
                applicability.kind === LiveApplicabilityKind.Builder
            ) {
                expect(range).toEqual({
                    highest: computeTopStepLiveStartingBalance(
                        plan.accountSize,
                        plan.accountSize,
                    ),
                    lowest: computeTopStepLiveStartingBalance(
                        dollars(0),
                        plan.accountSize,
                    ),
                });
                continue;
            }
            expect(range ?? null).toBe(null);
        }
    });

    it('builds every modeled entry with its own default cushion', () => {
        for (const plan of REGISTRY_PLANS) {
            const applicability = livePlanApplicability(plan.id);
            expect(defaultBuildCushion(applicability)).toBe(
                applicability.kind === LiveApplicabilityKind.NotModeled
                    ? null
                    : applicability.defaultCushionPercent,
            );
        }
    });

    it('marks a model approximation for an unverified mapping or defaulted hidden live state only', () => {
        const approximated = REGISTRY_PLANS.filter((plan) =>
            isLiveModelApproximation(livePlanApplicability(plan.id)),
        ).map((plan) => serializePlanId(plan.id));

        expect(approximated.toSorted(bySerial)).toEqual(
            [
                serializePlanId({
                    accountSize: SIZE,
                    firm: FirmId.FundedNext,
                    variant: FundedNextVariant.Flex,
                }),
                ...[
                    TopStepVariant.NoFeeConsistency,
                    TopStepVariant.NoFeeConsistencyDll,
                    TopStepVariant.NoFeeStandard,
                    TopStepVariant.NoFeeStandardDll,
                    TopStepVariant.StandardConsistency,
                    TopStepVariant.StandardConsistencyDll,
                    TopStepVariant.StandardStandard,
                    TopStepVariant.StandardStandardDll,
                ].map((variant) =>
                    serializePlanId({
                        accountSize: SIZE,
                        firm: FirmId.TopStep,
                        variant,
                    }),
                ),
            ].toSorted(bySerial),
        );
    });

    it('returns the same frozen entry on every call, so no caller can edit the table', () => {
        const id: PlanId = {
            accountSize: SIZE,
            firm: FirmId.Apex,
            variant: ApexVariant.Eod,
        };

        expect(livePlanApplicability(id)).toBe(livePlanApplicability(id));
        expect(Object.isFrozen(livePlanApplicability(id))).toBe(true);
    });
});
