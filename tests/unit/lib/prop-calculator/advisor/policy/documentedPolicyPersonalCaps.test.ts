import { describe, expect, it } from 'vitest';
import { ZodError } from 'zod';

import {
    type AccountState,
    ApexVariant,
    type ComputeRisk,
    type Dollars,
    dollars,
    FirmId,
    InstrumentSymbol,
    type Plan,
    type Points,
    points,
    SIM_INPUTS_REFUSAL_PREFIX,
} from '~/lib/prop-calculator';
import {
    buildEnginePolicy,
    DEFAULT_RULEBOOK,
    enginePolicyKey,
    NO_PERSONAL_CAPS,
    type PersonalCaps,
} from '~/lib/prop-calculator/advisor';
import {
    type DocumentedPolicySpec,
    documentedPolicySpecSchema,
    type EnginePolicy,
    enginePolicySchema,
    toSimInputs,
} from '~/lib/prop-calculator/advisor/policy';
import { findFirm } from '~/lib/prop-calculator/firms';

function planOf(variant: ApexVariant): Plan {
    const id = { accountSize: 50_000, firm: FirmId.Apex, variant } as const;
    const found = findFirm(FirmId.Apex)?.findPlan(id);
    if (!found) throw new Error(`Apex ${variant} 50K plan missing`);
    return found;
}

const apexIntraday = planOf(ApexVariant.Intraday);
const apexEod = planOf(ApexVariant.Eod);

interface Limits {
    readonly caps?: Partial<PersonalCaps>;
    readonly dll?: Dollars | null;
    readonly sizing?: { instrument: InstrumentSymbol; stopPoints: Points };
}

function fundedStateOf(plan: Plan): AccountState {
    const state = plan.initialState();
    plan.beginFundedPhase(state);
    return state;
}

function policyOf(plan: Plan, limits: Limits): EnginePolicy {
    const { policy } = buildEnginePolicy({
        fundedHorizonDays: 40,
        plan,
        positionSizing: limits.sizing ?? null,
        rulebook: DEFAULT_RULEBOOK,
    });
    return {
        ...policy,
        personalCaps: { ...NO_PERSONAL_CAPS, ...limits.caps },
        personalDll: limits.dll ?? null,
    };
}

function riskOf(computeRisk: ComputeRisk | undefined): ComputeRisk {
    if (computeRisk === undefined) throw new Error('expected a computed policy');
    return computeRisk;
}

function specOf(plan: Plan, limits: Limits): DocumentedPolicySpec {
    return {
        enginePolicy: policyOf(plan, limits),
        rulebook: DEFAULT_RULEBOOK,
        run: { maxEvalDays: 30, seed: 1, trials: 10 },
    };
}

describe('the engine policy carries the personal limits (PT-68f, F-V16)', () => {
    it('accepts the personal caps and the personal daily loss limit', () => {
        const policy = policyOf(apexEod, {
            caps: { maxRiskPerTrade: dollars(150), maxTradesPerDay: 2 },
            dll: dollars(600),
        });

        expect(enginePolicySchema.parse(policy)).toEqual(policy);
    });

    it('rejects a personal cap that is not above zero', () => {
        const policy = policyOf(apexEod, {
            caps: { maxRiskPerTrade: dollars(0) },
        });

        expect(() => enginePolicySchema.parse(policy)).toThrow(ZodError);
    });

    it('keys two policies that differ only in a personal limit differently', () => {
        const keys = [
            policyOf(apexEod, {}),
            policyOf(apexEod, { caps: { maxRiskPerTrade: dollars(150) } }),
            policyOf(apexEod, { caps: { dailyProfitCap: dollars(500) } }),
            policyOf(apexEod, { caps: { maxTradesPerDay: 2 } }),
            policyOf(apexEod, { dll: dollars(600) }),
        ].map(enginePolicyKey);

        expect(new Set(keys).size).toBe(keys.length);
    });

    it('survives the documented spec schema and a structured clone', () => {
        const spec = specOf(apexEod, {
            caps: { maxRiskPerTrade: dollars(150) },
            dll: dollars(600),
        });

        expect(
            documentedPolicySpecSchema.parse(structuredClone(spec)),
        ).toEqual(spec);
    });
});

describe('toSimInputs simulates the documented day at the personal limits (PT-68f, F-V16)', () => {
    it('sizes the first eval trade at the personal max risk, not the $400 rulebook rung', () => {
        const uncapped = toSimInputs(apexIntraday, specOf(apexIntraday, {}));
        const capped = toSimInputs(
            apexIntraday,
            specOf(apexIntraday, { caps: { maxRiskPerTrade: dollars(150) } }),
        );
        const state = apexIntraday.initialState();

        expect(riskOf(uncapped.evalDayPolicy?.computeRisk)(state, 0)).toBe(400);
        expect(riskOf(capped.evalDayPolicy?.computeRisk)(state, 0)).toBe(150);
    });

    it('leaves the eval rungs of a day untouched when the personal cap sits above every rung', () => {
        const loose = toSimInputs(
            apexIntraday,
            specOf(apexIntraday, { caps: { maxRiskPerTrade: dollars(5000) } }),
        );
        const uncapped = toSimInputs(apexIntraday, specOf(apexIntraday, {}));
        const looseRisk = riskOf(loose.evalDayPolicy?.computeRisk);
        const uncappedRisk = riskOf(uncapped.evalDayPolicy?.computeRisk);
        const looseState = apexIntraday.initialState();
        const uncappedState = apexIntraday.initialState();

        for (let index = 0; index < 4; index++) {
            const next = looseRisk(looseState, index);
            expect(next).toBe(uncappedRisk(uncappedState, index));
            looseState.balance -= next;
            looseState.todayPnL -= next;
            uncappedState.balance -= next;
            uncappedState.todayPnL -= next;
        }
    });

    it('keeps the funded day a flat ladder when no personal limit is set', () => {
        const inputs = toSimInputs(apexEod, specOf(apexEod, {}));

        expect(inputs.fundedDayPolicy?.computeRisk).toBeUndefined();
        expect(inputs.fundedDayPolicy?.ladder).toEqual([250, 250, 250, 250]);
        expect(inputs.riskPerTrade).toBe(250);
    });

    it('caps the funded ladder at the personal max risk on the flat policy', () => {
        const inputs = toSimInputs(
            apexEod,
            specOf(apexEod, { caps: { maxRiskPerTrade: dollars(100) } }),
        );

        expect(inputs.fundedDayPolicy?.computeRisk).toBeUndefined();
        expect(inputs.fundedDayPolicy?.ladder).toEqual([100, 100, 100, 100]);
        expect(inputs.riskPerTrade).toBe(100);
    });

    it('limits the flat funded ladder to the personal max trades per day', () => {
        const inputs = toSimInputs(
            apexEod,
            specOf(apexEod, { caps: { maxTradesPerDay: 1 } }),
        );

        expect(inputs.fundedDayPolicy?.computeRisk).toBeUndefined();
        expect(inputs.fundedDayPolicy?.ladder).toEqual([250]);
    });

    it('gives a funded policy bit-identical to the no-limit one when a max risk and a max trades sit above the rulebook', () => {
        const plain = toSimInputs(apexEod, specOf(apexEod, {}));
        const loose = toSimInputs(
            apexEod,
            specOf(apexEod, {
                caps: { maxRiskPerTrade: dollars(5000), maxTradesPerDay: 99 },
            }),
        );

        expect(loose.fundedDayPolicy).toEqual(plain.fundedDayPolicy);
        expect(loose.riskPerTrade).toBe(plain.riskPerTrade);
    });

    it('runs the funded day through the documented rule only for a limit the flat policy cannot express', () => {
        const withDll = toSimInputs(
            apexEod,
            specOf(apexEod, { dll: dollars(600) }),
        );
        const withProfitCap = toSimInputs(
            apexEod,
            specOf(apexEod, { caps: { dailyProfitCap: dollars(700) } }),
        );

        expect(withDll.fundedDayPolicy?.computeRisk).toBeDefined();
        expect(withProfitCap.fundedDayPolicy?.computeRisk).toBeDefined();
    });

    it('stops the documented funded day at the personal max trades per day', () => {
        const inputs = toSimInputs(
            apexEod,
            specOf(apexEod, {
                caps: { maxTradesPerDay: 1 },
                dll: dollars(600),
            }),
        );
        const state = fundedStateOf(apexEod);
        const risk = riskOf(inputs.fundedDayPolicy?.computeRisk);

        expect(risk(state, 0)).toBe(250);
        state.balance -= 250;
        state.todayPnL -= 250;
        expect(risk(state, 1)).toBe(0);
    });

    it('refuses a personal max risk below one contract at the entered stop instead of simulating no trades', () => {
        const spec = specOf(apexEod, {
            caps: { maxRiskPerTrade: dollars(100) },
            sizing: { instrument: InstrumentSymbol.NQ, stopPoints: points(10) },
        });

        expect(() => toSimInputs(apexEod, spec)).toThrow(
            SIM_INPUTS_REFUSAL_PREFIX,
        );
    });
});
