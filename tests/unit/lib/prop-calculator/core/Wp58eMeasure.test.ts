import { appendFileSync } from 'node:fs';
import { expect, it } from 'vitest';

import { ALL_FIRMS } from '~/lib/prop-calculator';
import { dollars, FirmId } from '~/lib/prop-calculator/core';
import {
    computeFundedStateValue,
    warmFirmsRegistryCache,
} from '~/lib/prop-calculator/core/FundedStateValue';

it('measure', async () => {
    await warmFirmsRegistryCache();
    const plan = ALL_FIRMS.find((f) => f.id === FirmId.AlphaFutures)?.plans.find(
        (p) => p.accountSize === 50_000 && p.label === '$50K · Standard',
    );
    if (!plan) throw new Error('no plan');
    const tail = process.env.TAIL === undefined ? undefined : Number(process.env.TAIL);
    const trades = process.env.TRADES === undefined ? undefined : Number(process.env.TRADES);
    const t = Date.now();
    const r = computeFundedStateValue({
        actionStepMultiple: 0.125,
        cushionStepMultiple: 0.25,
        dayCost: Number(process.env.DAYCOST ?? '0'),
        evalInitialValue: 0,
        feePerAttempt: dollars(0),
        maxActionMultiple: 1,
        maxTailCushionMultiple: tail,
        meanHorizonDays: 252,
        plan,
        rrRatio: 2,
        tradesPerDay: trades,
        winrate: 0.5,
    });
    appendFileSync(
        '/private/tmp/claude-501/-Users-sadrashameli-Personal-sadra-nl/1b264b7a-c902-4b3b-b522-d0676e267927/scratchpad/wp58e_measure.log',
        `tail=${tail} trades=${trades} dayCost=${process.env.DAYCOST}: states ${r.reachedStateCount} value ${r.initialValue} unconv ${r.unconvergedLevelCount} sweeps ${r.sweepCount} ms ${Date.now() - t} grid ${JSON.stringify(r.cushionGrid)}\n`,
    );
    expect(true).toBe(true);
}, 3_400_000);
