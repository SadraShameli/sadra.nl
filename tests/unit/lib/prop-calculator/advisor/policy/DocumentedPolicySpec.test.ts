import { describe, expect, it } from 'vitest';

import {
    createInitialState,
    type FundedCycleSeed,
    InstrumentSymbol,
    TradingPhase,
} from '~/lib/prop-calculator';
import {
    DEFAULT_RULEBOOK,
    HARD_RULE_2_MIN_RETAINED_CUSHION_CENTS,
} from '~/lib/prop-calculator/advisor';
import {
    type DocumentedPolicySpec,
    documentedPolicySpecSchema,
    type EnginePolicy,
    enginePolicySchema,
    LifetimePayoutCapBasis,
    MAX_COMMISSION_PER_ROUND_TRIP,
    MAX_INTRADAY_PATH_STEPS_PER_R,
    RebuyLagBasis,
} from '~/lib/prop-calculator/advisor/policy';

const BASE_POLICY: EnginePolicy = {
    commissionPerRoundTrip: 4.5,
    fundedHorizonDays: 60,
    instrument: InstrumentSymbol.NQ,
    intradayPathStepsPerR: 10,
    lifetimePayoutCapBasis: LifetimePayoutCapBasis.LiveTriggersNotChecked,
    lifetimePayoutCapOverride: null,
    payoutRequestOverride: null,
    rebuyLagBasis: RebuyLagBasis.AssumedZero,
    rebuyLagDays: 0,
    retainedCushionRequest: null,
    stopPoints: 10,
};

const BASE_SPEC: DocumentedPolicySpec = {
    enginePolicy: BASE_POLICY,
    planSerial: 'apex-50000-eod',
    rulebook: DEFAULT_RULEBOOK,
    run: { maxAttempts: 3, maxEvalDays: 60, seed: 42, trials: 200 },
};

function findFunctionPath(value: unknown, path = '$'): null | string {
    if (typeof value === 'function') return path;
    if (typeof value !== 'object' || value === null) return null;
    for (const [key, child] of Object.entries(value)) {
        const found = findFunctionPath(child, `${path}.${key}`);
        if (found !== null) return found;
    }
    return null;
}

function issuePaths(input: unknown): string[] {
    const result = documentedPolicySpecSchema.safeParse(input);
    return result.success
        ? []
        : result.error.issues.map((issue) => issue.path.join('.'));
}

function specWith(policy: Partial<EnginePolicy>): unknown {
    return { ...BASE_SPEC, enginePolicy: { ...BASE_POLICY, ...policy } };
}

function withoutKeys<T extends object>(
    value: T,
    keys: readonly (keyof T)[],
): Partial<T> {
    return Object.fromEntries(
        Object.entries(value).filter(([key]) =>
            keys.every((omitted) => omitted !== key),
        ),
    ) as Partial<T>;
}

describe('EnginePolicy (PT-48a, PD-42: every engine-side field declared up front)', () => {
    it('declares exactly the engine-side fields and none of the rulebook ones', () => {
        const parsed = enginePolicySchema.parse(BASE_POLICY);

        expect(
            Object.keys(parsed).toSorted((left, right) =>
                left.localeCompare(right),
            ),
        ).toEqual([
            'commissionPerRoundTrip',
            'fundedHorizonDays',
            'instrument',
            'intradayPathStepsPerR',
            'lifetimePayoutCapBasis',
            'lifetimePayoutCapOverride',
            'payoutRequestOverride',
            'rebuyLagBasis',
            'rebuyLagDays',
            'retainedCushionRequest',
            'stopPoints',
        ]);
        for (const rulebookOwned of [
            'winrate',
            'rr',
            'rrRatio',
            'fundedDayPolicy',
            'ladderFractions',
            'mffSearchFractions',
        ]) {
            expect(
                enginePolicySchema.safeParse({
                    ...BASE_POLICY,
                    [rulebookOwned]: 1,
                }).success,
            ).toBe(false);
        }
    });

    it('accepts a policy without the optional instrument, stop and path steps', () => {
        const bare = withoutKeys(BASE_POLICY, [
            'instrument',
            'intradayPathStepsPerR',
            'stopPoints',
        ]);

        expect(enginePolicySchema.parse(bare)).toEqual(bare);
    });

    it('accepts an instrument without a stop (the contract limit only)', () => {
        const instrumentOnly = withoutKeys(BASE_POLICY, ['stopPoints']);

        expect(enginePolicySchema.safeParse(instrumentOnly).success).toBe(true);
    });

    it('accepts a verified count trigger with its override and a measured lag', () => {
        const policy: EnginePolicy = {
            ...BASE_POLICY,
            lifetimePayoutCapBasis: LifetimePayoutCapBasis.VerifiedCountTrigger,
            lifetimePayoutCapOverride: 4,
            payoutRequestOverride: 1000,
            rebuyLagBasis: RebuyLagBasis.Measured,
            rebuyLagDays: 2.5,
            retainedCushionRequest: 2500,
        };

        expect(enginePolicySchema.parse(policy)).toEqual(policy);
    });
});

describe('DocumentedPolicySpec schema (PT-48a, PD-39)', () => {
    it('accepts a DEFAULT_RULEBOOK spec and returns it unchanged', () => {
        expect(documentedPolicySpecSchema.parse(BASE_SPEC)).toEqual(BASE_SPEC);
    });

    it('accepts a spec without the optional plan serial and max attempts', () => {
        const withoutSerial = withoutKeys(BASE_SPEC, ['planSerial']);
        const spec = {
            ...withoutSerial,
            run: { maxEvalDays: 30, seed: 7, trials: 10 },
        };

        expect(documentedPolicySpecSchema.parse(spec)).toEqual(spec);
    });

    it('is JSON-serializable, survives structuredClone and holds no function', () => {
        const parsed = documentedPolicySpecSchema.parse(BASE_SPEC);

        expect(findFunctionPath(parsed)).toBeNull();
        expect(structuredClone(parsed)).toEqual(parsed);
        const json = JSON.stringify(parsed);
        expect(JSON.parse(json)).toEqual(parsed);
        expect(
            documentedPolicySpecSchema.parse(structuredClone(BASE_SPEC)),
        ).toEqual(BASE_SPEC);
    });

    it('rejects unknown keys at every level it owns', () => {
        expect(issuePaths({ ...BASE_SPEC, stage: 'eval' })).toEqual(['']);
        expect(issuePaths({ ...BASE_SPEC, planKey: 'x' })).toEqual(['']);
        expect(
            issuePaths({ ...BASE_SPEC, run: { ...BASE_SPEC.run, extra: 1 } }),
        ).toEqual(['run']);
        expect(issuePaths(specWith({ winrate: 0.4 } as never))).toEqual([
            'enginePolicy',
        ]);
    });

    it('rejects cents in dollar fields: sub-cent amounts and cent-named keys', () => {
        expect(issuePaths(specWith({ commissionPerRoundTrip: 4.505 }))).toEqual(
            ['enginePolicy.commissionPerRoundTrip'],
        );
        expect(
            issuePaths(specWith({ payoutRequestOverride: 500.001 })),
        ).toEqual(['enginePolicy.payoutRequestOverride']);
        expect(
            issuePaths(specWith({ retainedCushionRequest: 2000.004 })),
        ).toEqual(['enginePolicy.retainedCushionRequest']);
        expect(issuePaths(specWith({ requestCents: 50_000 } as never))).toEqual(
            ['enginePolicy'],
        );
    });

    it('rejects a commission entered in cents (450 for $4.50)', () => {
        expect(
            issuePaths(
                specWith({
                    commissionPerRoundTrip: MAX_COMMISSION_PER_ROUND_TRIP + 1,
                }),
            ),
        ).toEqual(['enginePolicy.commissionPerRoundTrip']);
        expect(issuePaths(specWith({ commissionPerRoundTrip: 450 }))).toEqual([
            'enginePolicy.commissionPerRoundTrip',
        ]);
    });

    it('rejects a negative or non-finite lag and a negative commission', () => {
        expect(
            issuePaths(
                specWith({
                    rebuyLagBasis: RebuyLagBasis.Measured,
                    rebuyLagDays: -1,
                }),
            ),
        ).toEqual(['enginePolicy.rebuyLagDays']);
        expect(
            issuePaths(
                specWith({
                    rebuyLagBasis: RebuyLagBasis.Measured,
                    rebuyLagDays: Infinity,
                }),
            ),
        ).toEqual(['enginePolicy.rebuyLagDays']);
        expect(issuePaths(specWith({ commissionPerRoundTrip: -1 }))).toEqual([
            'enginePolicy.commissionPerRoundTrip',
        ]);
    });

    it('rejects an assumed-zero lag that is not zero', () => {
        expect(issuePaths(specWith({ rebuyLagDays: 3 }))).toEqual([
            'enginePolicy.rebuyLagDays',
        ]);
    });

    it('rejects stopPoints without an instrument', () => {
        const stopOnly = withoutKeys(BASE_POLICY, ['instrument']);

        expect(issuePaths({ ...BASE_SPEC, enginePolicy: stopOnly })).toEqual([
            'enginePolicy.stopPoints',
        ]);
    });

    it('rejects a non-positive stop and path steps outside 1 to the max', () => {
        expect(issuePaths(specWith({ stopPoints: 0 }))).toEqual([
            'enginePolicy.stopPoints',
        ]);
        expect(issuePaths(specWith({ intradayPathStepsPerR: 0 }))).toEqual([
            'enginePolicy.intradayPathStepsPerR',
        ]);
        expect(
            issuePaths(
                specWith({
                    intradayPathStepsPerR: MAX_INTRADAY_PATH_STEPS_PER_R + 1,
                }),
            ),
        ).toEqual(['enginePolicy.intradayPathStepsPerR']);
    });

    it('ties the lifetime cap override to its basis', () => {
        expect(
            issuePaths(
                specWith({
                    lifetimePayoutCapBasis:
                        LifetimePayoutCapBasis.VerifiedCountTrigger,
                    lifetimePayoutCapOverride: null,
                }),
            ),
        ).toEqual(['enginePolicy.lifetimePayoutCapOverride']);
        expect(
            issuePaths(
                specWith({
                    lifetimePayoutCapBasis:
                        LifetimePayoutCapBasis.LiveTriggersNotChecked,
                    lifetimePayoutCapOverride: 5,
                }),
            ),
        ).toEqual(['enginePolicy.lifetimePayoutCapOverride']);
        expect(
            issuePaths(
                specWith({
                    lifetimePayoutCapBasis:
                        LifetimePayoutCapBasis.VerifiedCountTrigger,
                    lifetimePayoutCapOverride: 0,
                }),
            ),
        ).toEqual(['enginePolicy.lifetimePayoutCapOverride']);
    });

    it('keeps Hard Rule 2 on a retained cushion request unless the rulebook allows less', () => {
        const below = (HARD_RULE_2_MIN_RETAINED_CUSHION_CENTS - 1) / 100;

        expect(issuePaths(specWith({ retainedCushionRequest: below }))).toEqual(
            ['enginePolicy.retainedCushionRequest'],
        );
        expect(
            documentedPolicySpecSchema.safeParse({
                ...(specWith({ retainedCushionRequest: below }) as object),
                rulebook: {
                    ...DEFAULT_RULEBOOK,
                    payout: {
                        ...DEFAULT_RULEBOOK.payout,
                        allowBelowHardRule2: true,
                        retainedCushionCents: 0,
                    },
                },
            }).success,
        ).toBe(true);
    });

    it('rejects a run with zero trials, zero eval days, a fractional seed or zero attempts', () => {
        expect(
            issuePaths({ ...BASE_SPEC, run: { ...BASE_SPEC.run, trials: 0 } }),
        ).toEqual(['run.trials']);
        expect(
            issuePaths({
                ...BASE_SPEC,
                run: { ...BASE_SPEC.run, maxEvalDays: 0 },
            }),
        ).toEqual(['run.maxEvalDays']);
        expect(
            issuePaths({ ...BASE_SPEC, run: { ...BASE_SPEC.run, seed: 1.5 } }),
        ).toEqual(['run.seed']);
        expect(
            issuePaths({
                ...BASE_SPEC,
                run: { ...BASE_SPEC.run, maxAttempts: 0 },
            }),
        ).toEqual(['run.maxAttempts']);
    });

    it('rejects an invalid rulebook through rulebookSchema', () => {
        expect(
            issuePaths({
                ...BASE_SPEC,
                rulebook: {
                    ...DEFAULT_RULEBOOK,
                    strategy: { ...DEFAULT_RULEBOOK.strategy, winrate: 2 },
                },
            }),
        ).toEqual(['rulebook.strategy.winrate']);
    });

    it('rejects an empty plan serial', () => {
        expect(issuePaths({ ...BASE_SPEC, planSerial: '' })).toEqual([
            'planSerial',
        ]);
    });
});

const FUNDED_SEED: FundedCycleSeed = {
    calendarDayGateProgress: 3,
    cumulativePayout: 500,
    cycleBestDayProfit: 400,
    fundedResetsUsed: 0,
    lastPayoutBalance: 51_000,
    payoutsIssued: 1,
    qualifyingDaysAtLastPayout: 5,
};

describe('DocumentedPolicySpec.start (PT-48b, F-148)', () => {
    it('accepts an optional eval start and survives structuredClone unchanged', () => {
        const spec: DocumentedPolicySpec = {
            ...BASE_SPEC,
            start: {
                phase: TradingPhase.Eval,
                state: createInitialState(50_000, 48_000),
            },
        };

        const parsed = documentedPolicySpecSchema.parse(spec);
        expect(parsed.start).toEqual(spec.start);
        expect(structuredClone(parsed).start).toEqual(spec.start);
    });

    it('accepts an optional funded start with its cycle seed', () => {
        const spec: DocumentedPolicySpec = {
            ...BASE_SPEC,
            start: {
                phase: TradingPhase.Funded,
                seed: FUNDED_SEED,
                state: createInitialState(50_000, 48_000),
            },
        };

        const parsed = documentedPolicySpecSchema.parse(spec);
        expect(parsed.start).toEqual(spec.start);
        expect(structuredClone(parsed)).toEqual(parsed);
    });

    it('leaves start unset when the spec has no start', () => {
        expect(documentedPolicySpecSchema.parse(BASE_SPEC).start).toBeUndefined();
    });

    it('rejects a start with a state that has no finite balance', () => {
        expect(
            issuePaths({
                ...BASE_SPEC,
                start: {
                    phase: TradingPhase.Eval,
                    state: { ...createInitialState(50_000, 48_000), balance: NaN },
                },
            }),
        ).toEqual(['start']);
    });

    it('rejects a funded start whose cycle seed is malformed', () => {
        expect(
            issuePaths({
                ...BASE_SPEC,
                start: {
                    phase: TradingPhase.Funded,
                    seed: { ...FUNDED_SEED, fundedResetsUsed: -1 },
                    state: createInitialState(50_000, 48_000),
                },
            }),
        ).toEqual(['start']);
    });

    it('rejects a start with neither a recognised eval nor funded phase', () => {
        expect(
            issuePaths({
                ...BASE_SPEC,
                start: {
                    phase: 'live',
                    state: createInitialState(50_000, 48_000),
                },
            }),
        ).toEqual(['start']);
    });

    it('rejects a start whose state is missing a required AccountState field', () => {
        const fullState = createInitialState(50_000, 48_000);
        const stateWithoutTodayPnL: Partial<typeof fullState> = {
            ...fullState,
        };
        delete stateWithoutTodayPnL.todayPnL;
        expect(
            issuePaths({
                ...BASE_SPEC,
                start: {
                    phase: TradingPhase.Eval,
                    state: stateWithoutTodayPnL,
                },
            }),
        ).toEqual(['start']);
    });

    it('rejects a start whose state has consecutiveIdleDays as the wrong type', () => {
        expect(
            issuePaths({
                ...BASE_SPEC,
                start: {
                    phase: TradingPhase.Eval,
                    state: {
                        ...createInitialState(50_000, 48_000),
                        consecutiveIdleDays: '0',
                    },
                },
            }),
        ).toEqual(['start']);
    });
});
