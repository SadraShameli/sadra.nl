import { describe, expect, it } from 'vitest';

import { stableJson } from '~/lib/stableJson';

describe('stableJson (moved from the account router)', () => {
    it('prints a string array as the account router stored it in an Edited event', () => {
        expect(stableJson(['mff'])).toBe('["mff"]');
        expect(stableJson([])).toBe('[]');
    });

    it('sorts object keys so plan opt-ins print the same whatever their insertion order', () => {
        const sorted =
            '{"takesFundedReset":true,"takesOneTimeEarlyWithdrawal":false}';
        expect(
            stableJson(
                Object.fromEntries([
                    ['takesOneTimeEarlyWithdrawal', false],
                    ['takesFundedReset', true],
                ]),
            ),
        ).toBe(sorted);
        expect(
            stableJson({
                takesFundedReset: true,
                takesOneTimeEarlyWithdrawal: false,
            }),
        ).toBe(sorted);
    });

    it('sorts nested object keys and keeps array order', () => {
        expect(
            stableJson(
                JSON.parse('{"b":{"d":1,"c":[{"z":1,"y":2},"x"]},"a":null}'),
            ),
        ).toBe('{"a":null,"b":{"c":[{"y":2,"z":1},"x"],"d":1}}');
    });

    it('drops undefined members like JSON.stringify', () => {
        expect(
            stableJson(
                Object.fromEntries([
                    ['b', 1],
                    ['a', undefined],
                ]),
            ),
        ).toBe('{"b":1}');
    });

    it('prints a date through its ISO form', () => {
        expect(stableJson({ at: new Date(0) })).toBe(
            '{"at":"1970-01-01T00:00:00.000Z"}',
        );
    });

    it('prints scalars as JSON', () => {
        expect(stableJson('a"b')).toBe(String.raw`"a\"b"`);
        expect(stableJson(12.5)).toBe('12.5');
        expect(stableJson(null)).toBe('null');
    });
});
