import { describe, expect, it } from 'vitest';

import {
    ApexVariant,
    type DayPolicy,
    DayStopRuleKind,
    FirmId,
    InstrumentSymbol,
    type Plan,
    PolicySizing,
    SIM_INPUTS_REFUSAL_PREFIX,
    type SimInputs,
    simInputsSizingIssue,
    simulate,
} from '~/lib/prop-calculator';
import { findFirm } from '~/lib/prop-calculator/firms';

function apexEod50k(): Plan {
    const found = findFirm(FirmId.Apex)?.findPlan({
        accountSize: 50_000,
        firm: FirmId.Apex,
        variant: ApexVariant.Eod,
    });
    if (!found) throw new Error('Apex EOD 50K plan not found');
    return found;
}

function declaredLadder(sizing: PolicySizing): DayPolicy {
    return {
        ladder: [250, 250],
        maxLossesPerDay: null,
        sizing,
        stopRule: { kind: DayStopRuleKind.None },
    };
}

function esAtOnePointOne(riskPerTrade: number): null | string {
    return simInputsSizingIssue({
        instrument: InstrumentSymbol.ES,
        riskPerTrade,
        stopPoints: 1.1,
    });
}

function mnqRun(overrides: Partial<SimInputs>): () => unknown {
    return () =>
        simulate(
            simInputs({
                instrument: InstrumentSymbol.MNQ,
                stopPoints: 10,
                ...overrides,
            }),
        );
}

function raiseItTo(issue: null | string): number {
    const match = /Raise it to at least \$([\d,.]+),/.exec(issue ?? '');
    if (match?.[1] === undefined) throw new Error(`no minimum in ${issue}`);
    return Number(match[1].replaceAll(',', ''));
}

function simInputs(overrides: Partial<SimInputs> = {}): SimInputs {
    return {
        fundedHorizonDays: 5,
        maxEvalDays: 5,
        plan: apexEod50k(),
        riskPerTrade: 250,
        rrRatio: 2,
        seed: 1,
        tradesPerDay: 1,
        trials: 2,
        winrate: 0.5,
        ...overrides,
    };
}

describe('SIM_INPUTS_REFUSAL_PREFIX is the one prefix simulate refuses inputs with (WP39d)', () => {
    it('is "Invalid SimInputs: "', () => {
        expect(SIM_INPUTS_REFUSAL_PREFIX).toBe('Invalid SimInputs: ');
    });

    it('starts the sizing refusal simulate throws, followed by the shared issue text', () => {
        const inputs = simInputs({
            instrument: InstrumentSymbol.NQ,
            riskPerTrade: 150,
            stopPoints: 10,
        });
        const issue = simInputsSizingIssue(inputs);
        expect(issue).not.toBeNull();
        expect(() => simulate(inputs)).toThrow(
            `${SIM_INPUTS_REFUSAL_PREFIX}${issue ?? ''}`,
        );
    });

    it('starts the funded day policy conflict refusal', () => {
        expect(() =>
            simulate(
                simInputs({
                    fundedDayPolicy: declaredLadder(
                        PolicySizing.WholeContracts,
                    ),
                    fundedRiskPerTrade: 250,
                }),
            ),
        ).toThrow(
            new RegExp(
                `^${SIM_INPUTS_REFUSAL_PREFIX}fundedDayPolicy and fundedRiskPerTrade`,
            ),
        );
    });

    it('starts the declared sizing refusal, with the article that fits the phase', () => {
        expect(
            mnqRun({
                evalDayPolicy: declaredLadder(PolicySizing.WholeContracts),
            }),
        ).toThrow(
            new RegExp(
                String.raw`^${SIM_INPUTS_REFUSAL_PREFIX}evalDayPolicy\.sizing is wholeContracts, but an eval policy with position sizing`,
            ),
        );
        expect(
            mnqRun({
                fundedDayPolicy: declaredLadder(PolicySizing.ContractCapped),
            }),
        ).toThrow(
            new RegExp(
                String.raw`^${SIM_INPUTS_REFUSAL_PREFIX}fundedDayPolicy\.sizing is contractCapped, but a funded policy with position sizing`,
            ),
        );
    });
});

describe('the below-one-contract refusal agrees with the cent-tolerant whole-contract floor (WP39d)', () => {
    it('accepts $55 as one ES contract at a 1.1 point stop, whose contract risk is not exact in binary', () => {
        expect(esAtOnePointOne(55)).toBeNull();
    });

    it('refuses $54.99 there, printing both amounts in whole cents', () => {
        const issue = esAtOnePointOne(54.99);
        expect(issue).toContain('riskPerTrade $54.99 is below one ES contract');
        expect(issue).toContain('at a 1.1 point stop ($55)');
        expect(issue).toContain('Raise it to at least $55,');
        expect(issue).not.toMatch(/55\.0000/);
    });

    it('simulate runs a $55 funded risk as one ES contract at a 1.1 point stop', () => {
        expect(() =>
            simulate(
                simInputs({
                    instrument: InstrumentSymbol.ES,
                    riskPerTrade: 55,
                    stopPoints: 1.1,
                }),
            ),
        ).not.toThrow();
    });

    it('prints a fractional refused risk in cents through the currency formatter', () => {
        expect(
            simInputsSizingIssue({
                instrument: InstrumentSymbol.NQ,
                riskPerTrade: 12.5,
                stopPoints: 10,
            }),
        ).toContain('riskPerTrade $12.50 is below one NQ contract');
    });

    it('prints a thousands separator on a large contract risk', () => {
        expect(
            simInputsSizingIssue({
                instrument: InstrumentSymbol.NQ,
                riskPerTrade: 1000,
                stopPoints: 60,
            }),
        ).toContain('at a 60 point stop ($1,200)');
    });
});

describe('the below-one-contract refusal rounds the one-contract minimum up to whole cents, so the amount it asks for is accepted', () => {
    it.each([
        {
            instrument: InstrumentSymbol.ES,
            minimum: '$50.01',
            risk: 50,
            stopPoints: 1.0001,
        },
        {
            instrument: InstrumentSymbol.MNQ,
            minimum: '$24.61',
            risk: 24.6,
            stopPoints: 12.301,
        },
        {
            instrument: InstrumentSymbol.ES,
            minimum: '$55',
            risk: 54.99,
            stopPoints: 1.1,
        },
    ])(
        'names $minimum for $instrument at a $stopPoints point stop, and simInputsSizingIssue accepts that amount',
        ({ instrument, minimum, risk, stopPoints }) => {
            const issue = simInputsSizingIssue({
                instrument,
                riskPerTrade: risk,
                stopPoints,
            });
            expect(issue).toContain(`point stop (${minimum})`);
            expect(issue).toContain(`Raise it to at least ${minimum},`);
            expect(
                simInputsSizingIssue({
                    instrument,
                    riskPerTrade: raiseItTo(issue),
                    stopPoints,
                }),
            ).toBeNull();
        },
    );
});
