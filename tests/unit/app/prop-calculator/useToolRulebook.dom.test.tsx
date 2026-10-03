import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { RulebookSource } from '~/app/(app)/prop-calculator/_components/bankroll/rulebookSource';
import {
    type ToolRulebook,
    ToolRulebookStatus,
    useToolRulebook,
} from '~/app/(app)/prop-calculator/_components/useToolRulebook';
import {
    DEFAULT_RULEBOOK,
    type RulebookParameters,
} from '~/lib/prop-calculator/advisor';

interface QueryResult {
    data: RulebookParameters | undefined;
    isError: boolean;
}

interface SessionResult {
    data: null | { user: { id: string } };
    error: Error | null;
    isPending: boolean;
}

const queryMock = vi.hoisted(() => vi.fn());
const sessionMock = vi.hoisted(() => vi.fn());

vi.mock('~/lib/auth/client', () => ({
    useSession: () => sessionMock() as SessionResult,
}));

vi.mock('~/trpc/react', () => ({
    api: {
        propAccounts: {
            rulebook: {
                get: {
                    useQuery: (input: unknown, options: unknown) =>
                        queryMock(input, options) as QueryResult,
                },
            },
        },
    },
}));

const PERSONAL: RulebookParameters = {
    ...DEFAULT_RULEBOOK,
    payout: { ...DEFAULT_RULEBOOK.payout, retainedCushionCents: 123_400 },
};

function enabledOptions(): unknown[] {
    return queryMock.mock.calls.map(
        (call: unknown[]) => (call[1] as { enabled: boolean }).enabled,
    );
}

function signedIn(): SessionResult {
    return { data: { user: { id: 'user-a' } }, error: null, isPending: false };
}

function signedOut(): SessionResult {
    return { data: null, error: null, isPending: false };
}

describe('useToolRulebook (PT-112, F-155)', () => {
    let container: HTMLDivElement;
    let root: Root;
    let latest: null | ToolRulebook;

    function Probe() {
        latest = useToolRulebook();
        return null;
    }

    function render(): ToolRulebook {
        act(() => {
            root.render(<Probe />);
        });
        if (latest === null) throw new Error('hook did not run');
        return latest;
    }

    beforeEach(() => {
        vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
        latest = null;
        queryMock.mockReset();
        queryMock.mockReturnValue({ data: undefined, isError: false });
        sessionMock.mockReset();
        sessionMock.mockReturnValue(signedOut());
        container = document.createElement('div');
        document.body.append(container);
        root = createRoot(container);
    });

    afterEach(() => {
        act(() => {
            root.unmount();
        });
        container.remove();
        vi.unstubAllGlobals();
    });

    it('runs no query signed out and returns the default rulebook as ready', () => {
        const result = render();
        expect(new Set(enabledOptions())).toEqual(new Set([false]));
        expect(result.rulebook).toBe(DEFAULT_RULEBOOK);
        expect(result.userRulebook).toBeNull();
        expect(result.hasSession).toBe(false);
        expect(result.source).toBe(RulebookSource.DefaultSignedOut);
        expect(result.status).toBe(ToolRulebookStatus.Ready);
    });

    it('ignores data a disabled query still holds when signed out', () => {
        queryMock.mockReturnValue({ data: PERSONAL, isError: false });
        const result = render();
        expect(result.rulebook).toBe(DEFAULT_RULEBOOK);
        expect(result.userRulebook).toBeNull();
    });

    it('runs the query signed in and returns the personal rulebook as ready', () => {
        sessionMock.mockReturnValue(signedIn());
        queryMock.mockReturnValue({ data: PERSONAL, isError: false });
        const result = render();
        expect(new Set(enabledOptions())).toEqual(new Set([true]));
        expect(queryMock).toHaveBeenCalledWith(undefined, {
            enabled: true,
        });
        expect(result.rulebook).toBe(PERSONAL);
        expect(result.userRulebook).toBe(PERSONAL);
        expect(result.hasSession).toBe(true);
        expect(result.source).toBe(RulebookSource.User);
        expect(result.status).toBe(ToolRulebookStatus.Ready);
    });

    it('reports waiting while the signed-in query is pending, with the default rulebook meanwhile', () => {
        sessionMock.mockReturnValue(signedIn());
        const result = render();
        expect(result.rulebook).toBe(DEFAULT_RULEBOOK);
        expect(result.userRulebook).toBeNull();
        expect(result.source).toBe(RulebookSource.DefaultLoading);
        expect(result.status).toBe(ToolRulebookStatus.Loading);
    });

    it('reports a failure when the signed-in query fails', () => {
        sessionMock.mockReturnValue(signedIn());
        queryMock.mockReturnValue({ data: undefined, isError: true });
        const result = render();
        expect(result.rulebook).toBe(DEFAULT_RULEBOOK);
        expect(result.source).toBe(RulebookSource.DefaultFailed);
        expect(result.status).toBe(ToolRulebookStatus.Failed);
        expect(result.isQueryError).toBe(true);
    });

    it('reports waiting while the session is pending and runs no query', () => {
        sessionMock.mockReturnValue({
            data: null,
            error: null,
            isPending: true,
        });
        const result = render();
        expect(new Set(enabledOptions())).toEqual(new Set([false]));
        expect(result.source).toBe(RulebookSource.DefaultSessionPending);
        expect(result.status).toBe(ToolRulebookStatus.Loading);
    });

    it('reports a failure when the session check fails and runs no query', () => {
        sessionMock.mockReturnValue({
            data: null,
            error: new Error('session'),
            isPending: false,
        });
        const result = render();
        expect(new Set(enabledOptions())).toEqual(new Set([false]));
        expect(result.source).toBe(RulebookSource.DefaultSessionFailed);
        expect(result.status).toBe(ToolRulebookStatus.Failed);
    });
});
