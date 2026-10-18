import { describe, expect, it } from 'vitest';

import { RULE_SOURCE_LABEL, RuleSource } from '~/lib/prop-calculator/advisor';

describe('RULE_SOURCE_LABEL', () => {
    it.each(Object.values(RuleSource))(
        'names %s by what the rule says, never by its Hard Rule number',
        (source) => {
            expect(RULE_SOURCE_LABEL[source]).not.toMatch(/hard rule/i);
        },
    );

    it('gives every source its own label', () => {
        const labels = Object.values(RuleSource).map(
            (source) => RULE_SOURCE_LABEL[source],
        );
        expect(new Set(labels).size).toBe(labels.length);
    });
});
