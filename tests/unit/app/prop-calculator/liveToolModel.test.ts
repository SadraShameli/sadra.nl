import { describe, expect, it } from 'vitest';

import {
    buildLiveToolModel,
    LIVE_TOOL_CUSHION_REFUSAL,
    LIVE_TOOL_PAYOUT_REQUEST_REFUSAL,
    LIVE_TOOL_SIZING_REFUSAL,
    LIVE_TOOL_TRIALS,
    type LiveToolCalculatorInputs,
    liveToolModelCacheKey,
    LiveToolStatus,
    modeledLiveTool,
} from '~/app/(app)/prop-calculator/_components/live/liveToolModel';
import {
    ALL_FIRMS,
    effectivePayoutRequest,
    FirmId,
    InstrumentSymbol,
    type LivePlan,
    type Plan,
    TRADING_DAYS_PER_YEAR,
} from '~/lib/prop-calculator';
import { DEFAULT_RULEBOOK } from '~/lib/prop-calculator/advisor';
import {
    isLiveModelApproximation,
    LiveApplicabilityKind,
    livePlanApplicability,
} from '~/lib/prop-calculator/firms';

const ALL_PLANS: readonly Plan[] = ALL_FIRMS.flatMap((firm) => firm.plans);

function inputsFor(
    plan: Plan,
    overrides: Partial<LiveToolCalculatorInputs> = {},
): LiveToolCalculatorInputs {
    return {
        instrument: InstrumentSymbol.NQ,
        payoutRequestSize: null,
        plan,
        rrRatio: 2,
        seed: 1,
        stopPoints: 10,
        tradesPerDay: 4,
        winrate: 0.4,
        ...overrides,
    };
}

function planFor(isMatch: (plan: Plan) => boolean, description: string): Plan {
    const plan = ALL_PLANS.find((candidate) => isMatch(candidate));
    if (plan === undefined) throw new Error(`no plan found: ${description}`);
    return plan;
}

describe('buildLiveToolModel', () => {
    it('agrees with livePlanApplicability for every registry plan', () => {
        for (const plan of ALL_PLANS) {
            const applicability = livePlanApplicability(plan.id);
            const model = buildLiveToolModel(inputsFor(plan), DEFAULT_RULEBOOK);
            if (applicability.kind === LiveApplicabilityKind.NotModeled) {
                expect(model.status).toBe(LiveToolStatus.NotModeled);
                if (model.status !== LiveToolStatus.NotModeled) continue;
                expect(model.message).toContain('No live stage modeled');
                continue;
            }
            expect(model.status).toBe(LiveToolStatus.Modeled);
            if (model.status !== LiveToolStatus.Modeled) continue;
            if (applicability.kind === LiveApplicabilityKind.Builder) {
                expect(model.hasCaveatNote).toBe(
                    isLiveModelApproximation(applicability),
                );
            } else {
                expect(model.hasCaveatNote).toBe(true);
            }
        }
    });

    it('shows "no live stage modeled" for every E8 and FTMO Futures plan', () => {
        const plans = ALL_PLANS.filter(
            (plan) =>
                plan.id.firm === FirmId.E8Futures ||
                plan.id.firm === FirmId.FtmoFutures,
        );
        expect(plans.length).toBeGreaterThan(0);
        for (const plan of plans) {
            const model = buildLiveToolModel(inputsFor(plan), DEFAULT_RULEBOOK);
            expect(model.status).toBe(LiveToolStatus.NotModeled);
        }
    });

    it('marks a verified firm-specific live plan as modeled with no approximation note (Apex)', () => {
        const plan = planFor(
            (candidate) => candidate.id.firm === FirmId.Apex,
            'an Apex plan',
        );
        const model = buildLiveToolModel(inputsFor(plan), DEFAULT_RULEBOOK);
        expect(model.status).toBe(LiveToolStatus.Modeled);
        if (model.status !== LiveToolStatus.Modeled) return;
        expect(model.hasCaveatNote).toBe(false);
        expect(model.note).toBeNull();
    });

    it('marks TopStep live as a firm-level approximation', () => {
        const plan = planFor(
            (candidate) =>
                candidate.id.firm === FirmId.TopStep &&
                livePlanApplicability(candidate.id).kind ===
                    LiveApplicabilityKind.Builder,
            'a TopStep LFA-eligible plan',
        );
        const model = buildLiveToolModel(inputsFor(plan), DEFAULT_RULEBOOK);
        expect(model.status).toBe(LiveToolStatus.Modeled);
        if (model.status !== LiveToolStatus.Modeled) return;
        expect(model.hasCaveatNote).toBe(true);
        expect(model.note).not.toBeNull();
    });

    it('refuses a modeled plan with no instrument or stop', () => {
        const plan = planFor(
            (candidate) => candidate.id.firm === FirmId.Apex,
            'an Apex plan',
        );
        const refusedInstrument = buildLiveToolModel(
            inputsFor(plan, { instrument: null }),
            DEFAULT_RULEBOOK,
        );
        expect(refusedInstrument).toEqual({
            message: LIVE_TOOL_SIZING_REFUSAL,
            status: LiveToolStatus.Refused,
        });
        const refusedStop = buildLiveToolModel(
            inputsFor(plan, { stopPoints: null }),
            DEFAULT_RULEBOOK,
        );
        expect(refusedStop.status).toBe(LiveToolStatus.Refused);
    });

    it('sizes with the instrument, stop, winrate, rr, trades per day and seed from the calculator', () => {
        const plan = planFor(
            (candidate) => candidate.id.firm === FirmId.Apex,
            'an Apex plan',
        );
        const model = buildLiveToolModel(
            inputsFor(plan, {
                instrument: InstrumentSymbol.MNQ,
                rrRatio: 3,
                seed: 42,
                stopPoints: 15,
                tradesPerDay: 6,
                winrate: 0.55,
            }),
            DEFAULT_RULEBOOK,
        );
        expect(model.status).toBe(LiveToolStatus.Modeled);
        if (model.status !== LiveToolStatus.Modeled) return;
        expect(model.simInputs).toMatchObject({
            horizonDays: TRADING_DAYS_PER_YEAR,
            instrument: InstrumentSymbol.MNQ,
            rrRatio: 3,
            seed: 42,
            stopPoints: 15,
            tradesPerDay: 6,
            trials: LIVE_TOOL_TRIALS,
            winrate: 0.55,
        });
    });

    it('sets retainedCushion to the greater of the rulebook cushion and one full live drawdown, never the plan default alone', () => {
        const plan = planFor(
            (candidate) => candidate.id.firm === FirmId.Apex,
            'an Apex plan',
        );
        const lowCushionRulebook = {
            ...DEFAULT_RULEBOOK,
            payout: { ...DEFAULT_RULEBOOK.payout, retainedCushionCents: 1 },
        };
        const model = buildLiveToolModel(inputsFor(plan), lowCushionRulebook);
        expect(model.status).toBe(LiveToolStatus.Modeled);
        if (model.status !== LiveToolStatus.Modeled) return;
        expect(model.simInputs.retainedCushion).toBe(
            model.simInputs.plan.defaultRetainedCushion(),
        );

        const highCushionRulebook = {
            ...DEFAULT_RULEBOOK,
            payout: {
                ...DEFAULT_RULEBOOK.payout,
                retainedCushionCents: 50_000_000,
            },
        };
        const highModel = buildLiveToolModel(
            inputsFor(plan),
            highCushionRulebook,
        );
        expect(highModel.status).toBe(LiveToolStatus.Modeled);
        if (highModel.status !== LiveToolStatus.Modeled) return;
        expect(highModel.simInputs.retainedCushion).toBe(500_000);
    });

    it('sets payoutRequestSize from effectivePayoutRequest, falling back to the rulebook request when the calculator has none', () => {
        const plan = planFor(
            (candidate) => candidate.id.firm === FirmId.Apex,
            'an Apex plan',
        );
        const withoutRequest = buildLiveToolModel(
            inputsFor(plan),
            DEFAULT_RULEBOOK,
        );
        expect(withoutRequest.status).toBe(LiveToolStatus.Modeled);
        if (withoutRequest.status !== LiveToolStatus.Modeled) return;
        expect(withoutRequest.simInputs.payoutRequestSize).toBe(
            effectivePayoutRequest(
                withoutRequest.simInputs.plan,
                DEFAULT_RULEBOOK.payout.requestCents / 100,
            ),
        );

        const withRequest = buildLiveToolModel(
            inputsFor(plan, { payoutRequestSize: 3000 }),
            DEFAULT_RULEBOOK,
        );
        expect(withRequest.status).toBe(LiveToolStatus.Modeled);
        if (withRequest.status !== LiveToolStatus.Modeled) return;
        expect(withRequest.simInputs.payoutRequestSize).toBe(
            effectivePayoutRequest(withRequest.simInputs.plan, 3000),
        );
    });

    it('refuses a modeled plan with a payout request of $0 or below, instead of throwing', () => {
        const plan = planFor(
            (candidate) => candidate.id.firm === FirmId.Apex,
            'an Apex plan',
        );
        for (const payoutRequestSize of [0, -50]) {
            let model: ReturnType<typeof buildLiveToolModel> | undefined;
            expect(() => {
                model = buildLiveToolModel(
                    inputsFor(plan, { payoutRequestSize }),
                    DEFAULT_RULEBOOK,
                );
            }).not.toThrow();
            expect(model).toEqual({
                message: LIVE_TOOL_PAYOUT_REQUEST_REFUSAL,
                status: LiveToolStatus.Refused,
            });
        }
    });

    it('refuses a modeled plan whose default retained cushion cannot be derived, instead of throwing', () => {
        const plan = planFor(
            (candidate) => candidate.id.firm === FirmId.Apex,
            'an Apex plan',
        );
        const throwingPlan = {
            defaultRetainedCushion: () => {
                throw new Error(
                    'the one-drawdown default retained cushion can never be withdrawn from a trailing drawdown with no lock',
                );
            },
        } as unknown as LivePlan;
        let model: ReturnType<typeof modeledLiveTool> | undefined;
        expect(() => {
            model = modeledLiveTool(
                throwingPlan,
                inputsFor(plan),
                DEFAULT_RULEBOOK,
                null,
            );
        }).not.toThrow();
        expect(model).toEqual({
            message: LIVE_TOOL_CUSHION_REFUSAL,
            status: LiveToolStatus.Refused,
        });
    });
});

describe('liveToolModelCacheKey', () => {
    const plan = ALL_PLANS[0];
    if (plan === undefined) throw new Error('no registry plan');
    const base = inputsFor(plan);
    const baseKey = liveToolModelCacheKey(base, DEFAULT_RULEBOOK);

    it.each([
        ['instrument', { instrument: InstrumentSymbol.MNQ } as const],
        ['stopPoints', { stopPoints: 20 } as const],
        ['winrate', { winrate: 0.6 } as const],
        ['rrRatio', { rrRatio: 4 } as const],
        ['tradesPerDay', { tradesPerDay: 8 } as const],
        ['seed', { seed: 99 } as const],
        ['payoutRequestSize', { payoutRequestSize: 1234 } as const],
    ])('changes when %s changes', (_, patch) => {
        const key = liveToolModelCacheKey(
            { ...base, ...patch },
            DEFAULT_RULEBOOK,
        );
        expect(key).not.toBe(baseKey);
    });

    it('changes when the plan changes', () => {
        const other = ALL_PLANS.find(
            (candidate) => candidate.id.firm !== plan.id.firm,
        );
        if (other === undefined) throw new Error('need a second firm');
        const key = liveToolModelCacheKey(inputsFor(other), DEFAULT_RULEBOOK);
        expect(key).not.toBe(baseKey);
    });

    it('changes when the rulebook retained cushion or request size changes', () => {
        const cushionKey = liveToolModelCacheKey(base, {
            payout: {
                ...DEFAULT_RULEBOOK.payout,
                retainedCushionCents:
                    DEFAULT_RULEBOOK.payout.retainedCushionCents + 100,
            },
        });
        expect(cushionKey).not.toBe(baseKey);
        const requestKey = liveToolModelCacheKey(base, {
            payout: {
                ...DEFAULT_RULEBOOK.payout,
                requestCents: DEFAULT_RULEBOOK.payout.requestCents + 100,
            },
        });
        expect(requestKey).not.toBe(baseKey);
    });

    it('is stable for the same inputs', () => {
        expect(liveToolModelCacheKey(base, DEFAULT_RULEBOOK)).toBe(baseKey);
    });
});
