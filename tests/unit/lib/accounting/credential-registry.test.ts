import { describe, expect, it } from 'vitest';

import {
    CredentialKind,
    CredentialRegistry,
} from '~/lib/accounting/credentials';

describe('CredentialRegistry.get', () => {
    it('returns the descriptor registered for a known credential kind', () => {
        const descriptor = CredentialRegistry.instance.get(
            CredentialKind.EBoekhouden,
        );

        expect(descriptor?.id).toBe(CredentialKind.EBoekhouden);
    });

    it('returns undefined for an id that is not a credential kind', () => {
        expect(
            CredentialRegistry.instance.get('not-a-credential'),
        ).toBeUndefined();
        expect(CredentialRegistry.instance.get('')).toBeUndefined();
    });
});
