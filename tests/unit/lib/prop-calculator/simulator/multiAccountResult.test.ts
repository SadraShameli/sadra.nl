import { describe, expect, expectTypeOf, it } from 'vitest';

import {
    DayStopRuleKind,
    FirmId,
    MffuVariant,
    type Plan,
} from '~/lib/prop-calculator';
import { MyFundedFutures } from '~/lib/prop-calculator/firms';
import {
    CorrelationMode,
    type MultiAccountResult,
    simulatePortfolio,
} from '~/lib/prop-calculator/simulator';

function rapidEod(): Plan {
    const plan = new MyFundedFutures().findPlan({
        accountSize: 50_000,
        firm: FirmId.Mffu,
        variant: MffuVariant.RapidEod,
    });
    if (!plan) throw new Error('MFF Rapid EOD 50K plan not found');
    return plan;
}

describe('MultiAccountResult carries no placeholder theoretical pass probability (PT-53e)', () => {
    it('leaves the field out of the engine output', () => {
        const result = simulatePortfolio({
            accounts: 2,
            correlation: CorrelationMode.Independent,
            dayStop: { kind: DayStopRuleKind.None },
            fundedHorizonDays: 10,
            groups: 2,
            maxEvalDays: 15,
            plan: rapidEod(),
            riskPerTrade: 300,
            rrRatio: 2,
            seed: 7,
            tradesPerDay: 1,
            trials: 50,
            winrate: 0.45,
        });
        expect(Object.keys(result)).not.toContain('theoreticalPassProb');
        expect(result.perAccountPass).toBeGreaterThanOrEqual(0);
    });

    it('leaves the field out of the type', () => {
        expectTypeOf<MultiAccountResult>().not.toHaveProperty(
            'theoreticalPassProb',
        );
    });
});
