import { describe, expect, it } from 'vitest';

import {
    LADDER_IGNORED_INPUT_REASONS,
    LadderIgnoredInput,
} from '~/lib/prop-calculator';

describe('LADDER_IGNORED_INPUT_REASONS is the one table of what the ladder search ignores', () => {
    it('gives a reason for every ignored input', () => {
        expect(
            Object.keys(LADDER_IGNORED_INPUT_REASONS).toSorted((a, b) =>
                a.localeCompare(b),
            ),
        ).toStrictEqual(
            Object.values(LadderIgnoredInput).toSorted((a, b) =>
                a.localeCompare(b),
            ),
        );
    });

    it('phrases each reason as a verb phrase that follows "the ladder search" or "it"', () => {
        for (const reason of Object.values(LADDER_IGNORED_INPUT_REASONS)) {
            expect(reason).toMatch(/^[a-z]/);
            expect(reason).not.toMatch(/[.:]$/);
            expect(reason).not.toMatch(/^(the ladder search|it) /);
            expect(reason).not.toContain('\u{2014}');
        }
    });

    it('names no CLI flag, so the web note can reuse it', () => {
        for (const reason of Object.values(LADDER_IGNORED_INPUT_REASONS)) {
            expect(reason).not.toContain('--');
        }
    });

    it('states the retry model the ladder cost uses', () => {
        expect(
            LADDER_IGNORED_INPUT_REASONS[LadderIgnoredInput.MaxAttempts],
        ).toBe('prices unlimited retries into the cost per funded account');
    });
});
