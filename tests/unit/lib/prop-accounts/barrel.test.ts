import { describe, expect, expectTypeOf, it } from 'vitest';

import * as root from '~/lib/prop-accounts';
import * as advice from '~/lib/prop-accounts/advice';
import * as alerts from '~/lib/prop-accounts/alerts';
import * as core from '~/lib/prop-accounts/core';
import * as metrics from '~/lib/prop-accounts/metrics';

describe('the prop-accounts root barrel', () => {
    it.each([
        ['core', core],
        ['metrics', metrics],
        ['alerts', alerts],
        ['advice', advice],
    ] as const)('re-exports every value of %s unchanged', (_name, module) => {
        const missing = Object.entries(module)
            .filter(
                ([key, value]) =>
                    (root as Record<string, unknown>)[key] !== value,
            )
            .map(([key]) => key);
        expect(missing).toEqual([]);
    });

    it('exposes no export name twice across core, metrics, alerts and advice', () => {
        const names = [
            ...Object.keys(core),
            ...Object.keys(metrics),
            ...Object.keys(alerts),
            ...Object.keys(advice),
        ];
        const duplicates = names.filter(
            (name, index) => names.indexOf(name) !== index,
        );
        expect(duplicates).toEqual([]);
    });

    it('describes an unresolved plan from the stored plan key as read, opt-ins included', () => {
        expectTypeOf(core.describeUnresolvedPlan)
            .parameter(0)
            .toEqualTypeOf<Omit<core.PlanKeyInput, 'readIssues'>>();
        expect(
            core.describeUnresolvedPlan(
                {
                    accountSize: 50_000,
                    firmId: 'gone-firm',
                    optIns: null,
                    planSerial: 'retired-plan',
                },
                core.UnresolvedPlanReason.UnknownFirm,
            ),
        ).toBe('Unknown prop firm "gone-firm"');
    });

    it('exports the ledger transition provenance and the implied pass through the barrels', () => {
        expect(metrics.TransitionProvenance).toEqual(
            expect.objectContaining({ Recorded: 'recorded' }),
        );
        expect(
            metrics.isTransitionDateKnown(
                metrics.TransitionProvenance.ImpliedPassDateUnknown,
            ),
        ).toBe(false);
        expect(root.isTransitionDateKnown).toBe(metrics.isTransitionDateKnown);
        expectTypeOf<metrics.FundedSince>()
            .toHaveProperty('provenance')
            .toEqualTypeOf<metrics.TransitionProvenance>();
        expectTypeOf<core.ImpliedEvalPass>()
            .toHaveProperty('dateKnown')
            .toEqualTypeOf<boolean>();
        expectTypeOf(
            core.impliedEvalPassOn,
        ).returns.toEqualTypeOf<core.ImpliedEvalPass | null>();
    });
});
