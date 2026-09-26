import { describe, expect, expectTypeOf, it } from 'vitest';

import { defaultCalculatorState } from '~/app/(app)/prop-calculator/_components/calculatorReducer';
import {
    fundedTierOptions,
    normalizePositionSizeInput,
    type PositionSizeInput,
    positionSizePhases,
} from '~/app/(app)/prop-calculator/_components/positionSize/positionSizeModel';
import {
    decodePositionSize,
    defaultPositionSize,
    encodePositionSize,
    parsePositionSizeInstrument,
    parsePositionSizePhase,
    parsePositionSizeRisk,
    parsePositionSizeStop,
    PositionSizeUrlParameter,
} from '~/app/(app)/prop-calculator/_components/positionSize/positionSizeUrlState';
import { type CalculatorState } from '~/app/(app)/prop-calculator/_components/types';
import { encodeState } from '~/app/(app)/prop-calculator/_components/urlState';
import {
    ALL_FIRMS,
    ContractLimitKind,
    DayStopRuleKind,
    dollars,
    type Dollars,
    InstrumentSymbol,
    type Plan,
    points,
    type Points,
    serializePlanId,
    TradingPhase,
} from '~/lib/prop-calculator';
import { CalculatorUrlParameter } from '~/lib/schemas/calculatorUrlParameter';
import { calculatorScalarFieldsSchema } from '~/lib/schemas/url';

const ALL_PLANS: readonly Plan[] = ALL_FIRMS.flatMap((firm) => firm.plans);
const POSITION_SIZE_KEYS: readonly string[] = Object.values(
    PositionSizeUrlParameter,
);

const TIERED_PLAN = (() => {
    const plan = ALL_PLANS.find(
        (candidate) =>
            candidate.contractLimits?.fundedMinis?.kind ===
                ContractLimitKind.Tiered && !candidate.isInstantFunded,
    );
    if (plan === undefined) throw new Error('no tiered plan');
    return plan;
})();

function byText(a: string, b: string): number {
    return a.localeCompare(b);
}

function decodedWith(
    state: PositionSizeInput,
    key: PositionSizeUrlParameter,
    value: string,
): PositionSizeInput {
    return decodePositionSize(withParameter(state, key, value));
}

function queryKeys(query: string | URLSearchParams): string[] {
    return new URLSearchParams(query).keys().toArray();
}

function richestCalculatorState(): CalculatorState {
    return {
        ...defaultCalculatorState(),
        dayStop: { kind: DayStopRuleKind.FirstWin },
        instrument: InstrumentSymbol.NQ,
        payoutRequestSize: 500,
        retainedCushion: 2000,
        stopPoints: 10,
    };
}

function roundTrip(state: PositionSizeInput): PositionSizeInput {
    return decodePositionSize(new URLSearchParams(encodePositionSize(state)));
}

function tieredState(): PositionSizeInput {
    const [, second] = fundedTierOptions(TIERED_PLAN, InstrumentSymbol.MNQ);
    if (second === undefined) throw new Error('no second tier');
    return {
        instrument: InstrumentSymbol.MNQ,
        phase: TradingPhase.Funded,
        plan: TIERED_PLAN,
        risk: dollars(333.5),
        stopPoints: points(12.25),
        tierProfit: second,
    };
}

function withParameter(
    state: PositionSizeInput,
    key: PositionSizeUrlParameter,
    value: string,
): URLSearchParams {
    const parameters = new URLSearchParams(encodePositionSize(state));
    parameters.set(key, value);
    return parameters;
}

describe('encodePositionSize and decodePositionSize (F-26, F-155)', () => {
    it('round-trips risk, instrument, stop, plan, phase and tier', () => {
        const state = tieredState();
        const decoded = roundTrip(state);
        expect(decoded).toEqual(state);
        expect(decoded.plan).toBe(TIERED_PLAN);
    });

    it('round-trips the default state', () => {
        expect(roundTrip(defaultPositionSize())).toEqual(defaultPositionSize());
    });

    it('starts from $450 on NQ at a 7.5 point stop on the calculator default plan', () => {
        const state = defaultPositionSize();
        expect(state.risk).toBe(450);
        expect(state.instrument).toBe(InstrumentSymbol.NQ);
        expect(state.stopPoints).toBe(7.5);
        expect(state.plan).toBe(defaultCalculatorState().plan);
        expect(state.phase).toBe(positionSizePhases(state.plan)[0]);
        expect(state.tierProfit).toBeNull();
    });

    it('resolves every plan of every firm by its serial', () => {
        for (const plan of ALL_PLANS) {
            const phase = positionSizePhases(plan)[0] ?? TradingPhase.Funded;
            const decoded = roundTrip({
                ...defaultPositionSize(),
                phase,
                plan,
            });
            expect(decoded.plan).toBe(plan);
            expect(decoded.phase).toBe(phase);
        }
    });

    it('writes the plan as its serial and leaves out a start tier', () => {
        const parameters = new URLSearchParams(
            encodePositionSize(defaultPositionSize()),
        );
        expect(parameters.get(PositionSizeUrlParameter.Plan)).toBe(
            serializePlanId(defaultPositionSize().plan.id),
        );
        expect(parameters.has(PositionSizeUrlParameter.Tier)).toBe(false);
    });

    it('decodes an empty query to the default state', () => {
        expect(decodePositionSize(new URLSearchParams())).toEqual(
            defaultPositionSize(),
        );
    });

    it('floors a sub-cent risk to whole cents, never up', () => {
        expect(
            decodedWith(
                defaultPositionSize(),
                PositionSizeUrlParameter.Risk,
                '100.009',
            ).risk,
        ).toBe(100);
    });
});

describe('encodePositionSize with fields left out', () => {
    it('leaves out the given keys so a field the user is still fixing is never shared', () => {
        const state = tieredState();
        const omitted = [
            PositionSizeUrlParameter.Risk,
            PositionSizeUrlParameter.Stop,
        ];
        const omittedKeys: ReadonlySet<string> = new Set(omitted);
        const query = encodePositionSize(state, omitted);
        expect(queryKeys(query).toSorted(byText)).toEqual(
            POSITION_SIZE_KEYS.filter((key) => !omittedKeys.has(key)).toSorted(
                byText,
            ),
        );
        const defaults = defaultPositionSize();
        expect(decodePositionSize(new URLSearchParams(query))).toEqual({
            ...state,
            risk: defaults.risk,
            stopPoints: defaults.stopPoints,
        });
    });

    it('writes every key when nothing is left out', () => {
        const state = tieredState();
        expect(encodePositionSize(state, [])).toBe(encodePositionSize(state));
    });
});

describe('decodePositionSize drops each invalid value on its own', () => {
    const base = tieredState();
    const defaults = defaultPositionSize();

    it.each(['abc', '-5', '0', '0.001', 'Infinity', 'NaN', '', '1e400'])(
        'drops the risk %j',
        (raw) => {
            expect(
                decodedWith(base, PositionSizeUrlParameter.Risk, raw),
            ).toEqual({ ...base, risk: defaults.risk });
        },
    );

    it.each(['XX', 'nq', '', 'MES2'])('drops the instrument %j', (raw) => {
        expect(
            decodedWith(base, PositionSizeUrlParameter.Instrument, raw),
        ).toEqual(
            normalizePositionSizeInput({
                ...base,
                instrument: defaults.instrument,
            }),
        );
    });

    it.each(['abc', '0', '-1', '0.1', 'NaN', 'Infinity', '', '10001'])(
        'drops the stop %j',
        (raw) => {
            expect(
                decodedWith(base, PositionSizeUrlParameter.Stop, raw),
            ).toEqual({ ...base, stopPoints: defaults.stopPoints });
        },
    );

    it.each(['nope-50000', '', 'apex'])('drops the plan %j', (raw) => {
        expect(decodedWith(base, PositionSizeUrlParameter.Plan, raw)).toEqual(
            normalizePositionSizeInput({ ...base, plan: defaults.plan }),
        );
    });

    it.each(['live', '', 'Funded'])('drops the phase %j', (raw) => {
        expect(decodedWith(base, PositionSizeUrlParameter.Phase, raw)).toEqual(
            normalizePositionSizeInput({
                ...base,
                phase: positionSizePhases(base.plan)[0] ?? TradingPhase.Funded,
            }),
        );
    });

    it.each(['abc', '123.45', '-1', ''])('drops the tier %j', (raw) => {
        expect(decodedWith(base, PositionSizeUrlParameter.Tier, raw)).toEqual({
            ...base,
            tierProfit: null,
        });
    });

    it('drops the eval phase on an instant-funded plan', () => {
        const instant = ALL_PLANS.find((plan) => plan.isInstantFunded);
        if (instant === undefined) throw new Error('no instant plan');
        const parameters = withParameter(
            { ...defaults, phase: TradingPhase.Funded, plan: instant },
            PositionSizeUrlParameter.Phase,
            TradingPhase.Eval,
        );
        expect(decodePositionSize(parameters).phase).toBe(TradingPhase.Funded);
    });

    it('falls back to the default plan when no firm is given', () => {
        const query = new URLSearchParams(encodePositionSize(base));
        expect(decodePositionSize(query, []).plan).toBe(defaults.plan);
    });
});

describe('the position-size query keys (PD-8 a)', () => {
    it('share no key with any calculator query', () => {
        const defaultQuery = encodeState(defaultCalculatorState());
        const richestQuery = encodeState(richestCalculatorState());
        const calculatorKeys = new Set([
            ...queryKeys(defaultQuery),
            ...queryKeys(richestQuery),
            ...Object.values(CalculatorUrlParameter),
            ...Object.keys(calculatorScalarFieldsSchema.shape),
            'dp',
        ]);
        for (const key of POSITION_SIZE_KEYS) {
            expect(calculatorKeys.has(key)).toBe(false);
        }
    });

    it('are unique', () => {
        expect(new Set(POSITION_SIZE_KEYS).size).toBe(
            POSITION_SIZE_KEYS.length,
        );
    });

    it('decode a calculator query to the default position size', () => {
        const query = encodeState(richestCalculatorState());
        expect(decodePositionSize(query)).toEqual(defaultPositionSize());
    });

    it('write only their own keys', () => {
        const written = queryKeys(encodePositionSize(tieredState()));
        expect(written.toSorted(byText)).toEqual(
            POSITION_SIZE_KEYS.toSorted(byText),
        );
    });
});

describe('parsePositionSizeRisk and parsePositionSizeStop (the form fields)', () => {
    it('accept what the query accepts and give null otherwise', () => {
        expect(parsePositionSizeRisk('475')).toBe(475);
        expect(parsePositionSizeRisk(' 333.5 ')).toBe(333.5);
        expect(parsePositionSizeRisk('100.009')).toBe(100);
        for (const raw of ['', 'abc', '0', '-1', '0.004', 'Infinity']) {
            expect(parsePositionSizeRisk(raw)).toBeNull();
        }
        expect(parsePositionSizeStop('7.75')).toBe(7.75);
        for (const raw of ['', 'abc', '0', '0.1', '-2', '10001']) {
            expect(parsePositionSizeStop(raw)).toBeNull();
        }
    });
});

describe('position-size codec units', () => {
    it('brands the parsed risk as Dollars and the parsed stop as Points', () => {
        expectTypeOf(
            parsePositionSizeRisk,
        ).returns.toEqualTypeOf<Dollars | null>();
        expectTypeOf(
            parsePositionSizeStop,
        ).returns.toEqualTypeOf<null | Points>();
    });
});

describe('parsePositionSizeInstrument and parsePositionSizePhase (the form selects)', () => {
    it('accept the enum values and give null otherwise', () => {
        expect(parsePositionSizeInstrument('MNQ')).toBe(InstrumentSymbol.MNQ);
        expect(parsePositionSizeInstrument('mnq')).toBeNull();
        expect(parsePositionSizeInstrument('')).toBeNull();
        expect(parsePositionSizePhase('funded')).toBe(TradingPhase.Funded);
        expect(parsePositionSizePhase('live')).toBeNull();
    });
});
