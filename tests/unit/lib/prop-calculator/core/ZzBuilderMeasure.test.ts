import { appendFileSync } from 'node:fs';

import { expect, it } from 'vitest';

import { ALL_FIRMS } from '~/lib/prop-calculator';
import { dollars } from '~/lib/prop-calculator/core';
import { isFundedDpEligible } from '~/lib/prop-calculator/core/FundedStateValue';

const plans = ALL_FIRMS.flatMap((firm) =>
    firm.plans.filter(
        (plan) =>
            plan.fundedConsistencyRule() !== null &&
            isFundedDpEligible(plan) &&
            plan.accountSize === 50_000,
    ),
);
const index = Number(process.env.PLAN_INDEX ?? '-1');
const tail = process.env.TAIL === undefined ? undefined : Number(process.env.TAIL);
const tag = process.env.TAG ?? '';

it('measure', async () => {
    const mod =
        process.env.VERSION === 'orig'
            ? await import('~/lib/prop-calculator/core/ZzFundedStateValueOrig')
            : await import('~/lib/prop-calculator/core/FundedStateValue');
    const { computeFundedStateValue, warmFirmsRegistryCache } = mod;
    await warmFirmsRegistryCache();
    const plan = plans[index];
    if (!plan) {
        appendFileSync('/private/tmp/claude-501/-Users-sadrashameli-Personal-sadra-nl/1b264b7a-c902-4b3b-b522-d0676e267927/scratchpad/measure2.log', `COUNT ${plans.map((p, i) => `${i}:${p.id.firm}:${p.label}`).join(" ; ")}\n`);
        return;
    }
    const t = Date.now();
    const r = computeFundedStateValue({
        actionStepMultiple: 0.125,
        cushionStepMultiple: 0.25,
        evalInitialValue: 0,
        feePerAttempt: dollars(0),
        maxActionMultiple: 1,
        maxTailCushionMultiple: tail,
        meanHorizonDays: Number(process.env.HORIZON ?? "60"),
        plan,
        rrRatio: 2,
        tradesPerDay: 2,
        winrate: 0.5,
    });
    appendFileSync('/private/tmp/claude-501/-Users-sadrashameli-Personal-sadra-nl/1b264b7a-c902-4b3b-b522-d0676e267927/scratchpad/measure2.log', `${tag} #${index} ${plan.label} ${plan.id.firm}: states ${r.reachedStateCount} value ${r.initialValue} unconv ${r.unconvergedLevelCount} err ${r.valueErrorBound} sweeps ${r.sweepCount} ms ${Date.now() - t}\n`);
    expect(true).toBe(true);
}, 3_000_000);
