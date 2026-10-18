import { describe, expect, it } from 'vitest';

import { defaultCalculatorState } from '~/app/(app)/prop-calculator/_components/calculatorReducer';
import {
    decodePayoutPlannerUrlState,
    defaultPayoutPlannerUrlState,
    encodePayoutPlannerUrlState,
    hasPayoutPlannerUrlRequest,
    parsePayoutPlannerBalance,
    parsePayoutPlannerCount,
    parsePayoutPlannerDate,
    parsePayoutPlannerOptionalDollars,
    type PayoutPlannerUrlState,
} from '~/app/(app)/prop-calculator/_components/payoutPlanner/payoutPlannerUrlState';
import { encodeState } from '~/app/(app)/prop-calculator/_components/urlState';
import {
    ALL_FIRMS,
    dollars,
    type Plan,
    serializePlanId,
} from '~/lib/prop-calculator';
import {
    DEFAULT_RULEBOOK,
    type RulebookParameters,
    SizingStage,
} from '~/lib/prop-calculator/advisor';
import { CalculatorUrlParameter } from '~/lib/schemas/calculatorUrlParameter';
import { PayoutPlannerUrlParameter } from '~/lib/schemas/payoutPlannerUrlParameter';

const ALL_PLANS: readonly Plan[] = ALL_FIRMS.flatMap((firm) => firm.plans);
const PAYOUT_PLANNER_KEYS: readonly string[] = Object.values(
    PayoutPlannerUrlParameter,
);

function byText(a: string, b: string): number {
    return a.localeCompare(b);
}

function queryKeys(query: string | URLSearchParams): string[] {
    return new URLSearchParams(query).keys().toArray();
}

function richState(): PayoutPlannerUrlState {
    return {
        balance: dollars(62_500),
        floorAtLastPayout: dollars(51_000),
        lastPayoutOn: '2026-04-01',
        payoutsTaken: 2,
        peak: dollars(64_000),
        plan: ALL_PLANS[3] ?? defaultCalculatorState().plan,
        qualifyingDaysSinceLastPayout: 4,
        requestSize: dollars(1500),
        stage: SizingStage.Funded,
    };
}

function roundTrip(state: PayoutPlannerUrlState): PayoutPlannerUrlState {
    return decodePayoutPlannerUrlState(
        new URLSearchParams(encodePayoutPlannerUrlState(state)),
    );
}

function rulebookWithRequest(requestCents: number): RulebookParameters {
    return {
        ...DEFAULT_RULEBOOK,
        payout: { ...DEFAULT_RULEBOOK.payout, requestCents },
    };
}

describe('encodePayoutPlannerUrlState and decodePayoutPlannerUrlState', () => {
    it('round-trips plan, stage, balance, peak, payouts taken, qualifying days, last payout date, floor at last payout and request size', () => {
        const state = richState();
        expect(roundTrip(state)).toEqual(state);
        expect(roundTrip(state).plan).toBe(state.plan);
    });

    it('round-trips the default state', () => {
        expect(roundTrip(defaultPayoutPlannerUrlState())).toEqual(
            defaultPayoutPlannerUrlState(),
        );
    });

    it('decodes an empty query to the default state', () => {
        expect(decodePayoutPlannerUrlState(new URLSearchParams())).toEqual(
            defaultPayoutPlannerUrlState(),
        );
    });

    it('resolves every plan of every firm by its serial', () => {
        for (const plan of ALL_PLANS) {
            const decoded = roundTrip({ ...richState(), plan });
            expect(decoded.plan).toBe(plan);
        }
    });

    it('writes the plan as its serial and leaves out unset optional fields', () => {
        const parameters = new URLSearchParams(
            encodePayoutPlannerUrlState(defaultPayoutPlannerUrlState()),
        );
        expect(parameters.get(PayoutPlannerUrlParameter.Plan)).toBe(
            serializePlanId(defaultPayoutPlannerUrlState().plan.id),
        );
        expect(parameters.has(PayoutPlannerUrlParameter.Peak)).toBe(false);
        expect(
            parameters.has(PayoutPlannerUrlParameter.FloorAtLastPayout),
        ).toBe(false);
        expect(parameters.has(PayoutPlannerUrlParameter.LastPayoutOn)).toBe(
            false,
        );
    });
});

describe('decodePayoutPlannerUrlState drops each invalid value on its own', () => {
    const defaults = defaultPayoutPlannerUrlState();

    it.each(['abc', '-5', '0', 'NaN', 'Infinity', '', '1e400'])(
        'drops an invalid balance %j',
        (raw) => {
            const parameters = new URLSearchParams();
            parameters.set(PayoutPlannerUrlParameter.Balance, raw);
            expect(decodePayoutPlannerUrlState(parameters).balance).toBe(
                defaults.balance,
            );
        },
    );

    it.each(['abc', '-1', ''])('drops an invalid peak %j', (raw) => {
        const parameters = new URLSearchParams();
        parameters.set(PayoutPlannerUrlParameter.Peak, raw);
        expect(decodePayoutPlannerUrlState(parameters).peak).toBeNull();
    });

    it.each(['abc', '-1', ''])('drops an invalid payouts-taken %j', (raw) => {
        const parameters = new URLSearchParams();
        parameters.set(PayoutPlannerUrlParameter.Payouts, raw);
        expect(decodePayoutPlannerUrlState(parameters).payoutsTaken).toBe(
            defaults.payoutsTaken,
        );
    });

    it('accepts a payouts-taken of exactly 0', () => {
        const parameters = new URLSearchParams();
        parameters.set(PayoutPlannerUrlParameter.Payouts, '0');
        expect(decodePayoutPlannerUrlState(parameters).payoutsTaken).toBe(0);
    });

    it.each(['not-a-date', '2026-13-40', ''])(
        'drops an invalid last payout date %j',
        (raw) => {
            const parameters = new URLSearchParams();
            parameters.set(PayoutPlannerUrlParameter.LastPayoutOn, raw);
            expect(
                decodePayoutPlannerUrlState(parameters).lastPayoutOn,
            ).toBeNull();
        },
    );

    it.each(['live', 'eval', ''])('drops an unsupported stage %j', (raw) => {
        const parameters = new URLSearchParams();
        parameters.set(PayoutPlannerUrlParameter.Stage, raw);
        expect(decodePayoutPlannerUrlState(parameters).stage).toBe(
            SizingStage.Funded,
        );
    });

    it.each(['nope-50000', '', 'apex'])('drops the plan %j', (raw) => {
        const parameters = new URLSearchParams();
        parameters.set(PayoutPlannerUrlParameter.Plan, raw);
        expect(decodePayoutPlannerUrlState(parameters).plan).toBe(
            defaults.plan,
        );
    });
});

describe('the payout planner query keys (PD-8 a)', () => {
    it('share no key with any calculator query', () => {
        const defaultQuery = encodeState(defaultCalculatorState());
        const calculatorKeys = new Set([
            ...queryKeys(defaultQuery),
            ...Object.values(CalculatorUrlParameter),
        ]);
        for (const key of PAYOUT_PLANNER_KEYS) {
            expect(calculatorKeys.has(key)).toBe(false);
        }
    });

    it('are unique', () => {
        expect(new Set(PAYOUT_PLANNER_KEYS).size).toBe(
            PAYOUT_PLANNER_KEYS.length,
        );
    });

    it('write only their own keys', () => {
        const written = queryKeys(encodePayoutPlannerUrlState(richState()));
        expect(written.toSorted(byText)).toEqual(
            PAYOUT_PLANNER_KEYS.toSorted(byText),
        );
    });
});

describe('the payout planner form-field parsers', () => {
    it('accept what the query accepts and give null otherwise', () => {
        expect(parsePayoutPlannerBalance('5000')).toBe(5000);
        expect(parsePayoutPlannerBalance('0')).toBeNull();
        expect(parsePayoutPlannerBalance('abc')).toBeNull();
        expect(parsePayoutPlannerCount('3')).toBe(3);
        expect(parsePayoutPlannerCount('0')).toBe(0);
        expect(parsePayoutPlannerCount('-1')).toBeNull();
        expect(parsePayoutPlannerDate('2026-04-01')).toBe('2026-04-01');
        expect(parsePayoutPlannerDate('not-a-date')).toBeNull();
        expect(parsePayoutPlannerOptionalDollars('0')).toBe(0);
        expect(parsePayoutPlannerOptionalDollars('-1')).toBeNull();
    });
});

describe('the starting payout request (PT-98, F-30)', () => {
    const rulebook750 = rulebookWithRequest(75_000);

    it('starts at the anonymous default rulebook request of $500 with no rulebook given', () => {
        expect(DEFAULT_RULEBOOK.payout.requestCents).toBe(50_000);
        expect(
            decodePayoutPlannerUrlState(new URLSearchParams()).requestSize,
        ).toBe(500);
        expect(defaultPayoutPlannerUrlState().requestSize).toBe(500);
    });

    it('starts at the rulebook payout request when the URL carries none', () => {
        expect(
            decodePayoutPlannerUrlState(
                new URLSearchParams(),
                ALL_FIRMS,
                rulebook750,
            ).requestSize,
        ).toBe(750);
        expect(defaultPayoutPlannerUrlState(rulebook750).requestSize).toBe(750);
    });

    it('lets a typed request in the URL win over the rulebook request', () => {
        const parameters = new URLSearchParams();
        parameters.set(PayoutPlannerUrlParameter.RequestSize, '900');
        expect(
            decodePayoutPlannerUrlState(parameters, ALL_FIRMS, rulebook750)
                .requestSize,
        ).toBe(900);
    });

    it.each(['abc', '0', '-5', ''])(
        'falls back to the rulebook request for an invalid URL request %j',
        (raw) => {
            const parameters = new URLSearchParams();
            parameters.set(PayoutPlannerUrlParameter.RequestSize, raw);
            expect(
                decodePayoutPlannerUrlState(parameters, ALL_FIRMS, rulebook750)
                    .requestSize,
            ).toBe(750);
        },
    );

    it('says whether the URL carries a usable request', () => {
        const typed = new URLSearchParams();
        typed.set(PayoutPlannerUrlParameter.RequestSize, '900');
        const invalid = new URLSearchParams();
        invalid.set(PayoutPlannerUrlParameter.RequestSize, 'abc');
        expect(hasPayoutPlannerUrlRequest(typed)).toBe(true);
        expect(hasPayoutPlannerUrlRequest(invalid)).toBe(false);
        expect(hasPayoutPlannerUrlRequest(new URLSearchParams())).toBe(false);
    });
});
