import { describe, expect, it } from 'vitest';

import { ALL_FIRMS } from '~/lib/prop-calculator/firms';
import { planLabel } from '~/lib/prop-calculator/firms/shared';

const EM_DASH = '\u{2014}';

describe('planLabel (WP21b: no em dash in any plan label)', () => {
    it('joins the account size and the suffix with the middle dot the UI already uses', () => {
        expect(planLabel(50_000, 'Zero')).toBe('$50K · Zero');
    });

    it('builds every registered plan label without an em dash', () => {
        const labels = ALL_FIRMS.flatMap((firm) =>
            firm.plans.map((plan) => plan.label),
        );
        expect(labels.length).toBeGreaterThan(0);
        expect(labels.filter((label) => label.includes(EM_DASH))).toEqual([]);
        expect(labels.filter((label) => !/^\$\d+K · \S/u.test(label))).toEqual(
            [],
        );
    });
});
