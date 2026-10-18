import { describe, expect, it } from 'vitest';

import { AccountStatus, isEndedStatus } from '~/lib/prop-accounts/core';

describe('isEndedStatus', () => {
    it('is true for Busted, Concluded and Closed', () => {
        expect(isEndedStatus(AccountStatus.Busted)).toBe(true);
        expect(isEndedStatus(AccountStatus.Concluded)).toBe(true);
        expect(isEndedStatus(AccountStatus.Closed)).toBe(true);
    });

    it('is false for every other status', () => {
        expect(isEndedStatus(AccountStatus.Active)).toBe(false);
        expect(isEndedStatus(AccountStatus.Suspended)).toBe(false);
    });
});
