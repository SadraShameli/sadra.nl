import { type SimOutputs } from '~/lib/prop-calculator';

export enum RuinFixtureKey {
    Middling = 'middling',
    Negative = 'negative',
    Risky = 'risky',
    Steady = 'steady',
    Unaffordable = 'unaffordable',
}

export interface RuinFixtureSpec {
    readonly costPerAttempt: number;
    readonly evPerAttempt: number;
    readonly key: RuinFixtureKey;
    readonly monthlyNet: number;
    readonly netValues: readonly number[];
}

export const RUIN_FIXTURE_BANKROLL_CENTS = 100_000;

export const RUIN_FIXTURE_SPECS: readonly RuinFixtureSpec[] = [
    {
        costPerAttempt: 500,
        evPerAttempt: 5,
        key: RuinFixtureKey.Risky,
        monthlyNet: 900,
        netValues: [-500, 1500],
    },
    {
        costPerAttempt: 500,
        evPerAttempt: 5,
        key: RuinFixtureKey.Steady,
        monthlyNet: 100,
        netValues: [100],
    },
    {
        costPerAttempt: 500,
        evPerAttempt: 5,
        key: RuinFixtureKey.Middling,
        monthlyNet: 500,
        netValues: [-500, ...Array.from({ length: 9 }, () => 600)],
    },
    {
        costPerAttempt: 5000,
        evPerAttempt: 5,
        key: RuinFixtureKey.Unaffordable,
        monthlyNet: 700,
        netValues: [100],
    },
    {
        costPerAttempt: 500,
        evPerAttempt: -5,
        key: RuinFixtureKey.Negative,
        monthlyNet: 1000,
        netValues: [100],
    },
];

export const RUIN_FIXTURE_MONTHLY_ORDER: readonly RuinFixtureKey[] = [
    RuinFixtureKey.Negative,
    RuinFixtureKey.Risky,
    RuinFixtureKey.Unaffordable,
    RuinFixtureKey.Middling,
    RuinFixtureKey.Steady,
];

export const RUIN_FIXTURE_RUIN_FIRST_ORDER: readonly RuinFixtureKey[] = [
    RuinFixtureKey.Steady,
    RuinFixtureKey.Middling,
    RuinFixtureKey.Risky,
    RuinFixtureKey.Unaffordable,
    RuinFixtureKey.Negative,
];

export function ruinFixtureOut(
    base: SimOutputs,
    spec: RuinFixtureSpec,
): SimOutputs {
    return {
        ...base,
        costPerAttempt: spec.costPerAttempt,
        expectedMonthlyNet: spec.monthlyNet,
        expectedNet: spec.monthlyNet,
        expectedNetPerAttempt: spec.evPerAttempt,
        netValues: [...spec.netValues],
    };
}
