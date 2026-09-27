import { describe, expect, it } from 'vitest';

import {
    EvalPurchaseEffect,
    FixedCooldown,
    LiveBustCooldownKind,
    ReturnByNewEvaluationCooldown,
    SimAccountEffect,
    TimeLiveReducedCooldown,
    UnknownCooldown,
    UNVERIFIED_LIVE_EXCLUSIVITY_POLICY,
    UpToCooldown,
} from '~/lib/prop-calculator/core';

describe('LiveBustCooldown hierarchy', () => {
    it('FixedCooldown is active strictly before its fixed number of days', () => {
        const cooldown = new FixedCooldown(14);
        expect(cooldown.kind).toBe(LiveBustCooldownKind.Fixed);
        expect(cooldown.isActive(13, 0)).toBe(true);
        expect(cooldown.isActive(14, 0)).toBe(false);
    });

    it('UpToCooldown is active strictly before its ceiling', () => {
        const cooldown = new UpToCooldown(28);
        expect(cooldown.isActive(27, 0)).toBe(true);
        expect(cooldown.isActive(28, 0)).toBe(false);
    });

    it('TimeLiveReducedCooldown shortens once the account has been live long enough', () => {
        const cooldown = new TimeLiveReducedCooldown([
            { cooldownDays: 90, minDaysLive: 0 },
            { cooldownDays: 30, minDaysLive: 60 },
        ]);
        expect(cooldown.isActive(89, 1)).toBe(true);
        expect(cooldown.isActive(90, 1)).toBe(false);
        expect(cooldown.isActive(29, 60)).toBe(true);
        expect(cooldown.isActive(30, 60)).toBe(false);
        expect(cooldown.isActive(29, 120)).toBe(true);
    });

    it('ReturnByNewEvaluation stays active regardless of elapsed days: only a fresh evaluation lifts it', () => {
        const cooldown = new ReturnByNewEvaluationCooldown();
        expect(cooldown.isActive(1000, 0)).toBe(true);
    });

    it('an unknown cooldown is conservatively treated as active', () => {
        const cooldown = new UnknownCooldown();
        expect(cooldown.kind).toBe(LiveBustCooldownKind.Unknown);
        expect(cooldown.isActive(1000, 1000)).toBe(true);
    });
});

describe('the unverified default exclusivity policy', () => {
    it('gives Unknown for the sim account effect, eval purchase effect and cooldown, with no source', () => {
        expect(UNVERIFIED_LIVE_EXCLUSIVITY_POLICY.simAccountEffect).toBe(
            SimAccountEffect.Unknown,
        );
        expect(UNVERIFIED_LIVE_EXCLUSIVITY_POLICY.evalPurchaseEffect).toBe(
            EvalPurchaseEffect.Unknown,
        );
        expect(UNVERIFIED_LIVE_EXCLUSIVITY_POLICY.cooldown.kind).toBe(
            LiveBustCooldownKind.Unknown,
        );
        expect(UNVERIFIED_LIVE_EXCLUSIVITY_POLICY.household).toBe(false);
        expect(UNVERIFIED_LIVE_EXCLUSIVITY_POLICY.source).toBeUndefined();
    });
});
