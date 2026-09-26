import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import {
    AlphaFuturesVariant,
    dollars,
    EodTrailingDrawdown,
    FirmId,
    NO_PLAN_OPT_INS,
    type Plan,
    type PlanId,
    withPlanOptIns,
} from '~/lib/prop-calculator';
import {
    PLAN_RULES_FINGERPRINT_LENGTH,
    planRulesFingerprint,
    serializePlanRules,
} from '~/lib/prop-calculator/describe';
import { findFirm } from '~/lib/prop-calculator/firms';

function planFor(planId: PlanId): Plan {
    const plan = findFirm(planId.firm)?.findPlan(planId);
    if (!plan) throw new Error(`plan not found: ${JSON.stringify(planId)}`);
    return plan;
}

const alphaStandard = planFor({
    accountSize: 50_000,
    firm: FirmId.AlphaFutures,
    variant: AlphaFuturesVariant.Standard,
});

function nodeSha256Hex(value: string): string {
    return createHash('sha256').update(value).digest('hex');
}

describe('planRulesFingerprint: sha256 of the serialized plan rules (PT-45)', () => {
    it('is 64 lowercase hex characters', async () => {
        const fingerprint = await planRulesFingerprint(alphaStandard);
        expect(fingerprint).toHaveLength(PLAN_RULES_FINGERPRINT_LENGTH);
        expect(fingerprint).toMatch(/^[\da-f]{64}$/);
    });

    it('matches an independent Node sha256 of the same serialized value', async () => {
        const fingerprint = await planRulesFingerprint(alphaStandard);
        expect(fingerprint).toBe(
            nodeSha256Hex(serializePlanRules(alphaStandard)),
        );
    });

    it('is deterministic for the same plan', async () => {
        const first = await planRulesFingerprint(alphaStandard);
        const second = await planRulesFingerprint(alphaStandard);
        expect(first).toBe(second);
    });

    it('changes when the DLL changes on a test plan', async () => {
        const base = await planRulesFingerprint(alphaStandard);
        const changedDll = alphaStandard.withOverrides({
            drawdown: new EodTrailingDrawdown({ amount: dollars(1500) }),
        });
        expect(await planRulesFingerprint(changedDll)).not.toBe(base);
    });

    it('changes when an opt-in changes', async () => {
        const declined = withPlanOptIns(alphaStandard, NO_PLAN_OPT_INS);
        const taken = withPlanOptIns(alphaStandard, {
            ...NO_PLAN_OPT_INS,
            takesFundedReset: true,
        });
        expect(await planRulesFingerprint(taken)).not.toBe(
            await planRulesFingerprint(declined),
        );
    });

    it('does not change when only notes or the label change', async () => {
        const base = await planRulesFingerprint(alphaStandard);
        const renamed = alphaStandard.withOverrides({
            label: 'Renamed plan',
        });
        expect(await planRulesFingerprint(renamed)).toBe(base);
    });
});
