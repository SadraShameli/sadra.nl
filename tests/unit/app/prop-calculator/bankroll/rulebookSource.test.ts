import { describe, expect, it } from 'vitest';

import {
    copySplitFundedSourceOf,
    rulebookOwnerText,
    RulebookSource,
    rulebookSourceNotice,
    rulebookSourceOf,
} from '~/app/(app)/prop-calculator/_components/bankroll/rulebookSource';
import { CopySplitFundedSource } from '~/lib/prop-calculator/advisor/policy';

describe('rulebookSourceOf (PT-63d)', () => {
    it('is the user rulebook once a signed-in session has its rulebook, even if a refetch failed after', () => {
        expect(
            rulebookSourceOf({
                hasRulebook: true,
                hasSession: true,
                isFailed: true,
                isSessionFailed: false,
                isSessionPending: false,
            }),
        ).toBe(RulebookSource.User);
    });

    it('is the default because signed out, whatever the query says', () => {
        expect(
            rulebookSourceOf({
                hasRulebook: true,
                hasSession: false,
                isFailed: false,
                isSessionFailed: false,
                isSessionPending: false,
            }),
        ).toBe(RulebookSource.DefaultSignedOut);
    });

    it('is the default because the signed-in query failed', () => {
        expect(
            rulebookSourceOf({
                hasRulebook: false,
                hasSession: true,
                isFailed: true,
                isSessionFailed: false,
                isSessionPending: false,
            }),
        ).toBe(RulebookSource.DefaultFailed);
    });

    it('is the default because the signed-in query is still loading', () => {
        expect(
            rulebookSourceOf({
                hasRulebook: false,
                hasSession: true,
                isFailed: false,
                isSessionFailed: false,
                isSessionPending: false,
            }),
        ).toBe(RulebookSource.DefaultLoading);
    });
});

describe('rulebookSourceOf while the session itself is unknown (PT-63e)', () => {
    const NO_SESSION = {
        hasRulebook: false,
        hasSession: false,
        isFailed: false,
    } as const;

    it('is the default because the session is still pending', () => {
        expect(
            rulebookSourceOf({
                ...NO_SESSION,
                isSessionFailed: false,
                isSessionPending: true,
            }),
        ).toBe(RulebookSource.DefaultSessionPending);
    });

    it('is the default because the session request failed', () => {
        expect(
            rulebookSourceOf({
                ...NO_SESSION,
                isSessionFailed: true,
                isSessionPending: false,
            }),
        ).toBe(RulebookSource.DefaultSessionFailed);
    });

    it('is the pending session, not the failed one, while both are reported', () => {
        expect(
            rulebookSourceOf({
                ...NO_SESSION,
                isSessionFailed: true,
                isSessionPending: true,
            }),
        ).toBe(RulebookSource.DefaultSessionPending);
    });

    it('is signed out once the session settled with no user and no error', () => {
        expect(
            rulebookSourceOf({
                ...NO_SESSION,
                isSessionFailed: false,
                isSessionPending: false,
            }),
        ).toBe(RulebookSource.DefaultSignedOut);
    });

    it('is the user rulebook whatever a stale session flag says once the session has a user and a rulebook', () => {
        expect(
            rulebookSourceOf({
                hasRulebook: true,
                hasSession: true,
                isFailed: false,
                isSessionFailed: true,
                isSessionPending: true,
            }),
        ).toBe(RulebookSource.User);
    });
});

describe('what each rulebook source says (PT-63d)', () => {
    it('maps to the copy split funded source: only the user rulebook is the user rulebook', () => {
        expect(copySplitFundedSourceOf(RulebookSource.User)).toBe(
            CopySplitFundedSource.UserRulebook,
        );
        for (const source of [
            RulebookSource.DefaultFailed,
            RulebookSource.DefaultLoading,
            RulebookSource.DefaultSignedOut,
            RulebookSource.DefaultSessionFailed,
            RulebookSource.DefaultSessionPending,
        ]) {
            expect(copySplitFundedSourceOf(source)).toBe(
                CopySplitFundedSource.DefaultRulebook,
            );
        }
    });

    it('names the owner as your rulebook only for the user rulebook', () => {
        expect(rulebookOwnerText(RulebookSource.User)).toBe('your rulebook');
        expect(rulebookOwnerText(RulebookSource.DefaultSignedOut)).toBe(
            'the default rulebook',
        );
        expect(rulebookOwnerText(RulebookSource.DefaultFailed)).toBe(
            'the default rulebook',
        );
        expect(rulebookOwnerText(RulebookSource.DefaultLoading)).toBe(
            'the default rulebook',
        );
        expect(rulebookOwnerText(RulebookSource.DefaultSessionFailed)).toBe(
            'the default rulebook',
        );
        expect(rulebookOwnerText(RulebookSource.DefaultSessionPending)).toBe(
            'the default rulebook',
        );
    });

    it('says the default rulebook is used while the sign-in is unknown, as a status when pending and an alert when failed', () => {
        expect(
            rulebookSourceNotice(RulebookSource.DefaultSessionPending),
        ).toStrictEqual({
            isFailure: false,
            text: 'Checking your sign-in: the default rulebook is used until it finishes.',
        });
        expect(
            rulebookSourceNotice(RulebookSource.DefaultSessionFailed),
        ).toStrictEqual({
            isFailure: true,
            text: 'Your sign-in could not be checked, so the default rulebook is used here.',
        });
    });

    it('says a failed or loading signed-in rulebook and nothing for the user or signed-out sources', () => {
        expect(
            rulebookSourceNotice(RulebookSource.DefaultFailed),
        ).toStrictEqual({
            isFailure: true,
            text: 'Your rulebook could not be loaded, so the default rulebook is used here.',
        });
        expect(
            rulebookSourceNotice(RulebookSource.DefaultLoading),
        ).toStrictEqual({
            isFailure: false,
            text: 'Loading your rulebook: the default rulebook is used until it loads.',
        });
        expect(rulebookSourceNotice(RulebookSource.User)).toBeNull();
        expect(
            rulebookSourceNotice(RulebookSource.DefaultSignedOut),
        ).toBeNull();
    });
});
