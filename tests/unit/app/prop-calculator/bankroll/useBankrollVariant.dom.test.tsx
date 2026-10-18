import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { RulebookSource } from '~/app/(app)/prop-calculator/_components/bankroll/rulebookSource';
import {
    type BankrollVariant,
    useBankrollVariant,
} from '~/app/(app)/prop-calculator/_components/bankroll/useBankrollVariant';
import { defaultCalculatorState } from '~/app/(app)/prop-calculator/_components/calculatorReducer';
import {
    DEFAULT_RULEBOOK,
    type RulebookParameters,
} from '~/lib/prop-calculator/advisor';

interface Harness {
    data: null | RulebookParameters;
    isError: boolean;
    options: Record<string, unknown>;
    sessionError: Error | null;
    sessionPending: boolean;
    userId: null | string;
}

const harness = vi.hoisted((): Harness => ({
    data: null,
    isError: false,
    options: {},
    sessionError: null,
    sessionPending: false,
    userId: null,
}));

vi.mock('~/app/(app)/prop-calculator/_components/CalculatorProvider', () => ({
    useCalculatorInputs: () => ({ state: defaultCalculatorState() }),
}));

vi.mock('~/lib/auth/client', () => ({
    useSession: () => ({
        data: harness.userId === null ? null : { user: { id: harness.userId } },
        error: harness.sessionError,
        isPending: harness.sessionPending,
    }),
}));

vi.mock('~/trpc/react', () => ({
    api: {
        propAccounts: {
            rulebook: {
                get: {
                    useQuery: (
                        _input: unknown,
                        options: Record<string, unknown>,
                    ) => {
                        harness.options = options;
                        return {
                            data: harness.data ?? undefined,
                            isError: harness.isError,
                        };
                    },
                },
            },
        },
    },
}));

describe('useBankrollVariant names the rulebook source (PT-63d, F-V24)', () => {
    let container: HTMLDivElement;
    let root: Root;
    let seen: BankrollVariant | null;

    function Probe() {
        seen = useBankrollVariant();
        return null;
    }

    function render() {
        act(() => {
            root.render(<Probe />);
        });
        if (seen === null) throw new Error('hook did not render');
        return seen;
    }

    beforeEach(() => {
        vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
        harness.data = null;
        harness.isError = false;
        harness.options = {};
        harness.sessionError = null;
        harness.sessionPending = false;
        harness.userId = null;
        seen = null;
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

    it('is the default rulebook because signed out, and never asks for the rulebook', () => {
        const variant = render();
        expect(variant.rulebookSource).toBe(RulebookSource.DefaultSignedOut);
        expect(variant.rulebook).toBe(DEFAULT_RULEBOOK);
        expect(harness.options).toMatchObject({ enabled: false });
    });

    it('is the user rulebook once the signed-in rulebook loaded, even when it equals the default', () => {
        harness.userId = 'user-1';
        harness.data = DEFAULT_RULEBOOK;
        const variant = render();
        expect(variant.rulebookSource).toBe(RulebookSource.User);
        expect(variant.rulebook).toBe(DEFAULT_RULEBOOK);
        expect(harness.options).toMatchObject({ enabled: true });
    });

    it('is the default because the signed-in query is loading', () => {
        harness.userId = 'user-1';
        const variant = render();
        expect(variant.rulebookSource).toBe(RulebookSource.DefaultLoading);
        expect(variant.rulebook).toBe(DEFAULT_RULEBOOK);
    });

    it('is the default because the signed-in query failed', () => {
        harness.userId = 'user-1';
        harness.isError = true;
        const variant = render();
        expect(variant.rulebookSource).toBe(RulebookSource.DefaultFailed);
        expect(variant.rulebook).toBe(DEFAULT_RULEBOOK);
    });

    it('is the default because the session is still pending, and never asks for the rulebook', () => {
        harness.sessionPending = true;
        const variant = render();
        expect(variant.rulebookSource).toBe(
            RulebookSource.DefaultSessionPending,
        );
        expect(variant.rulebook).toBe(DEFAULT_RULEBOOK);
        expect(harness.options).toMatchObject({ enabled: false });
    });

    it('is the default because the session request failed, and never asks for the rulebook', () => {
        harness.sessionError = new Error('session down');
        const variant = render();
        expect(variant.rulebookSource).toBe(
            RulebookSource.DefaultSessionFailed,
        );
        expect(variant.rulebook).toBe(DEFAULT_RULEBOOK);
        expect(harness.options).toMatchObject({ enabled: false });
    });
});
