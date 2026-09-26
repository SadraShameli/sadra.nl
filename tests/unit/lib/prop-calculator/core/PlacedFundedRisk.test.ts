import { describe, expect, it } from 'vitest';

import {
    ApexVariant,
    contracts,
    FirmId,
    formatOneContractRisk,
    formatWholeCentDollars,
    FUNDED_START_TIER_CONTRACT_LIMIT,
    fundedStartContractLimit,
    InstrumentSymbol,
    LucidVariant,
    MffuVariant,
    oneContractRisk,
    placedFundedRisk,
    placedFundedRiskAt,
    type Plan,
    resolvePositionSizing,
    simInputsSizingIssue,
    wholeContractCount,
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

function dollarAmount(printed: string): number {
    return Number(printed.slice(1).replaceAll(',', ''));
}

function esAtOnePointOne(riskPerTrade: number) {
    return placedFundedRisk(
        { instrument: InstrumentSymbol.ES, riskPerTrade, stopPoints: 1.1 },
        apexEod50k(),
    );
}

function lucidProNoDll(): Plan {
    const found = findFirm(FirmId.Lucid)?.findPlan({
        accountSize: 50_000,
        firm: FirmId.Lucid,
        variant: LucidVariant.ProNoDll,
    });
    if (!found) throw new Error('Lucid Pro no-DLL 50K plan not found');
    return found;
}

function mffPro50k(): Plan {
    const found = findFirm(FirmId.Mffu)?.findPlan({
        accountSize: 50_000,
        firm: FirmId.Mffu,
        variant: MffuVariant.Pro,
    });
    if (!found) throw new Error('MFF Pro 50K plan not found');
    return found;
}

function nqAtTen(riskPerTrade: number) {
    return placedFundedRisk(
        { instrument: InstrumentSymbol.NQ, riskPerTrade, stopPoints: 10 },
        lucidProNoDll(),
    );
}

describe('placedFundedRisk is the one placed funded risk the CLI and the web show (T33, WP39d)', () => {
    it('places 0 NQ contracts for $150 at a 10 point stop, the risk simulate refuses', () => {
        expect(nqAtTen(150)).toMatchObject({
            contracts: 0,
            isCapped: false,
            risk: 0,
        });
    });

    it('places one NQ contract ($200) for $200 at a 10 point stop', () => {
        expect(nqAtTen(200)).toMatchObject({
            contracts: 1,
            isCapped: false,
            risk: 200,
        });
    });

    it('places two NQ contracts ($400) for $450 at a 10 point stop, rounding down', () => {
        expect(nqAtTen(450)).toMatchObject({
            contracts: 2,
            isCapped: false,
            risk: 400,
        });
    });

    it('caps a $250 funded risk at the Lucid Pro funded limit of 40 MNQ at a 2 point stop', () => {
        expect(
            placedFundedRisk(
                {
                    instrument: InstrumentSymbol.MNQ,
                    riskPerTrade: 250,
                    stopPoints: 2,
                },
                lucidProNoDll(),
            ),
        ).toMatchObject({ contracts: 40, isCapped: true, risk: 160 });
    });

    it('caps at the start tier of a tiered funded limit: Apex EOD 50K starts funded at 20 micros', () => {
        const plan = apexEod50k();
        const mnqAtTwo = resolvePositionSizing(InstrumentSymbol.MNQ, 2);
        if (mnqAtTwo === null) throw new Error('MNQ sizing did not resolve');
        expect(fundedStartContractLimit(plan, mnqAtTwo)).toBe(contracts(20));
        expect(
            placedFundedRisk(
                {
                    instrument: InstrumentSymbol.MNQ,
                    riskPerTrade: 250,
                    stopPoints: 2,
                },
                plan,
            ),
        ).toMatchObject({ contracts: 20, isCapped: true, risk: 80 });
    });

    it('places the funded risk when one is given, not the eval risk', () => {
        expect(
            placedFundedRisk(
                {
                    fundedRiskPerTrade: 450,
                    instrument: InstrumentSymbol.NQ,
                    riskPerTrade: 150,
                    stopPoints: 10,
                },
                lucidProNoDll(),
            ),
        ).toMatchObject({ contracts: 2, risk: 400 });
    });

    it('applies no contract limit when no plan is given', () => {
        expect(
            placedFundedRisk({
                instrument: InstrumentSymbol.MNQ,
                riskPerTrade: 250,
                stopPoints: 2,
            }),
        ).toMatchObject({ contracts: 62, isCapped: false, risk: 248 });
    });

    it('returns the position sizing it placed the risk at', () => {
        expect(nqAtTen(450)?.positionSizing).toStrictEqual(
            resolvePositionSizing(InstrumentSymbol.NQ, 10),
        );
    });

    it('returns null without a stop, since the risk is then not placed in contracts', () => {
        expect(
            placedFundedRisk(
                {
                    instrument: InstrumentSymbol.NQ,
                    riskPerTrade: 450,
                    stopPoints: undefined,
                },
                lucidProNoDll(),
            ),
        ).toBeNull();
    });

    it('accepts $55 as one ES contract at a 1.1 point stop and refuses $54.99, with the cent-tolerant floor', () => {
        expect(esAtOnePointOne(55)?.contracts).toBe(1);
        expect(esAtOnePointOne(54.99)?.contracts).toBe(0);
    });

    it.each([
        [InstrumentSymbol.NQ, 10, [150, 199.99, 200, 250, 399.99, 400, 450]],
        [InstrumentSymbol.ES, 1.1, [54.99, 55, 109.99, 110, 164.99, 165]],
        [InstrumentSymbol.MNQ, 12.3, [24.59, 24.6, 49.2, 73.8, 80]],
    ] as const)(
        'places 0 %s contracts exactly when simInputsSizingIssue refuses the risk at a %d point stop',
        (instrument, stopPoints, risks) => {
            for (const riskPerTrade of risks) {
                const isRefused =
                    simInputsSizingIssue({
                        instrument,
                        riskPerTrade,
                        stopPoints,
                    }) !== null;
                const placed = placedFundedRisk(
                    { instrument, riskPerTrade, stopPoints },
                    lucidProNoDll(),
                );
                expect(placed?.contracts === 0).toBe(isRefused);
            }
        },
    );
});

describe('wholeContractCount and the money formatter are on the core barrel (WP39d)', () => {
    it('counts whole contracts with the cent tolerance through the barrel', () => {
        const esAtOnePointOne = resolvePositionSizing(InstrumentSymbol.ES, 1.1);
        if (esAtOnePointOne === null) {
            throw new Error('ES sizing did not resolve');
        }
        expect(oneContractRisk(esAtOnePointOne)).not.toBe(55);
        expect(wholeContractCount(55, esAtOnePointOne)).toBe(1);
    });

    it('prints dollars in whole cents, without cents when there are none', () => {
        expect(formatWholeCentDollars(50 * 1.1)).toBe('$55');
        expect(formatWholeCentDollars(12.5)).toBe('$12.50');
        expect(formatWholeCentDollars(3 * 24.6)).toBe('$73.80');
        expect(formatWholeCentDollars(1200)).toBe('$1,200');
        expect(formatWholeCentDollars(54.99)).toBe('$54.99');
    });
});

describe('formatOneContractRisk rounds the one-contract minimum up to whole cents with the cent tolerance', () => {
    it.each([
        { expected: '$55', stopPoints: 1.1, symbol: InstrumentSymbol.ES },
        { expected: '$50.01', stopPoints: 1.0001, symbol: InstrumentSymbol.ES },
        {
            expected: '$24.61',
            stopPoints: 12.301,
            symbol: InstrumentSymbol.MNQ,
        },
        { expected: '$24.60', stopPoints: 12.3, symbol: InstrumentSymbol.MNQ },
        { expected: '$1,200', stopPoints: 60, symbol: InstrumentSymbol.NQ },
    ])(
        'prints $expected for $symbol at a $stopPoints point stop, an amount that places one contract',
        ({ expected, stopPoints, symbol }) => {
            const positionSizing = resolvePositionSizing(symbol, stopPoints);
            if (positionSizing === null) throw new Error('no sizing');
            expect(formatOneContractRisk(positionSizing)).toBe(expected);
            expect(
                wholeContractCount(dollarAmount(expected), positionSizing),
            ).toBe(1);
        },
    );
});

describe('placedFundedRiskAt places a funded risk for an already resolved position sizing', () => {
    it.each([150, 200, 450])(
        'agrees with placedFundedRisk for NQ at a 10 point stop and $%d',
        (risk) => {
            const nqSizing = resolvePositionSizing(InstrumentSymbol.NQ, 10);
            if (nqSizing === null) throw new Error('no sizing');
            expect(
                placedFundedRiskAt(risk, nqSizing, apexEod50k()),
            ).toStrictEqual(
                placedFundedRisk(
                    {
                        instrument: InstrumentSymbol.NQ,
                        riskPerTrade: risk,
                        stopPoints: 10,
                    },
                    apexEod50k(),
                ),
            );
        },
    );
});

describe('placedFundedRiskAt caps at the MFF Pro 50K funded limit of 5 micros and 5 minis (N-75, WP42)', () => {
    const mnqAtTenSizing = resolvePositionSizing(InstrumentSymbol.MNQ, 10);
    const nqAtTenSizing = resolvePositionSizing(InstrumentSymbol.NQ, 10);

    it('places $150 at 5 MNQ = $100 on MFF Pro, capped, and 7 MNQ = $140 without a plan', () => {
        if (mnqAtTenSizing === null) throw new Error('no sizing');
        expect(
            placedFundedRiskAt(150, mnqAtTenSizing, mffPro50k()),
        ).toMatchObject({ contracts: 5, isCapped: true, risk: 100 });
        expect(placedFundedRiskAt(150, mnqAtTenSizing)).toMatchObject({
            contracts: 7,
            isCapped: false,
            risk: 140,
        });
    });

    it('places $1000 at 5 NQ = $1000 on MFF Pro, exactly at the limit and not capped', () => {
        if (nqAtTenSizing === null) throw new Error('no sizing');
        expect(
            placedFundedRiskAt(1000, nqAtTenSizing, mffPro50k()),
        ).toMatchObject({ contracts: 5, isCapped: false, risk: 1000 });
    });
});

describe('FUNDED_START_TIER_CONTRACT_LIMIT is the one cap phrase the CLI and the web print (WP39f)', () => {
    it('names the funded contract limit at the start tier, from the prop-calculator barrel', () => {
        expect(FUNDED_START_TIER_CONTRACT_LIMIT).toBe(
            'the funded contract limit at the start tier',
        );
    });
});
