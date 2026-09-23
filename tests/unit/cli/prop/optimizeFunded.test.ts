import type { ArgsDef } from 'citty';

import { parseArgs } from 'citty';
import { describe, expect, it } from 'vitest';

import optimizeFunded, {
    sortDescription,
} from '~/cli/commands/prop/optimize/funded/command';
import { planResolver } from '~/cli/commands/prop/shared';
import { FirmId, type Plan, type SimInputs } from '~/lib/prop-calculator';

async function resolveArguments(): Promise<ArgsDef> {
    const resolvable = optimizeFunded.args;
    if (!resolvable) throw new Error('optimize funded command has no args');
    const resolved =
        typeof resolvable === 'function' ? resolvable() : resolvable;
    return resolved instanceof Promise ? resolved : resolved;
}

describe('optimize funded --sort default', () => {
    it('defaults sort to monthly', async () => {
        const arguments_ = await resolveArguments();
        const parsed = parseArgs([], arguments_);
        expect(parsed.sort).toBe('monthly');
    });
});

describe('optimize funded --sort options', () => {
    it('only lists monthly and cycle as valid sort keys', async () => {
        const arguments_ = await resolveArguments();
        const sortArgument = arguments_.sort;
        if (sortArgument?.type !== 'enum') {
            throw new Error('sort argument is not an enum');
        }
        expect(sortArgument.options).toStrictEqual(['monthly', 'cycle']);
    });

    it('rejects --sort lifetime', async () => {
        const arguments_ = await resolveArguments();
        expect(() => parseArgs(['--sort', 'lifetime'], arguments_)).toThrow();
    });
});

function baseSimInputs(rebuyLagDays: number): SimInputs {
    return {
        fundedHorizonDays: 252,
        maxEvalDays: 40,
        plan: registryPlan(),
        rebuyLagDays,
        riskPerTrade: 250,
        rrRatio: 2,
        seed: 42,
        tradesPerDay: 4,
        trials: 100,
        winrate: 0.4,
    };
}

function registryPlan(): Plan {
    return planResolver.resolveOne({ firm: FirmId.Mffu, variant: 'rapid-eod' });
}

describe('optimize funded --sort monthly description', () => {
    it('states the configured rebuy lag and the horizon credit', () => {
        const description = sortDescription('monthly', baseSimInputs(3));
        expect(description).toContain('rebuy-lag-days');
        expect(description).toContain('3');
        expect(description.toLowerCase()).toContain('credit');
        expect(description.toLowerCase()).toContain('withdrawable');
    });

    it('states a rebuy lag of 0 when the input omits it', () => {
        const description = sortDescription('monthly', {
            fundedHorizonDays: 252,
            maxEvalDays: 40,
            plan: registryPlan(),
            riskPerTrade: 250,
            rrRatio: 2,
            seed: 42,
            tradesPerDay: 4,
            trials: 100,
            winrate: 0.4,
        });
        expect(description).toContain('0 rebuy-lag-days');
    });
});
