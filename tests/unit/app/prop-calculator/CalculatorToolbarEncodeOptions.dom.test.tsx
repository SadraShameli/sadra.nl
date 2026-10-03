import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { defaultCalculatorState } from '~/app/(app)/prop-calculator/_components/calculatorReducer';
import { CalculatorToolbar } from '~/app/(app)/prop-calculator/_components/CalculatorToolbar';
import {
    type EncodeStateOptions,
    ObjectiveUrlMode,
} from '~/app/(app)/prop-calculator/_components/urlState';
import { SizingObjective } from '~/lib/prop-calculator/advisor';
import { ALL_FIRMS } from '~/lib/prop-calculator/firms';
import { OBJECTIVE_URL_PARAMETER } from '~/lib/schemas/url';

interface Captured {
    buildLink: ((origin: string, pathname: string) => string) | null;
    encodeOptions: EncodeStateOptions | null;
}

const captured = vi.hoisted((): Captured => ({
    buildLink: null,
    encodeOptions: null,
}));

const provided = vi.hoisted(() => ({
    encodeOptions: {},
}));

vi.mock('~/app/(app)/prop-calculator/_components/CalculatorProvider', () => ({
    useCalculatorActions: () => ({ applyState: vi.fn() }),
    useCalculatorInputs: () => ({
        encodeOptions: provided.encodeOptions,
        firms: ALL_FIRMS,
        state: {
            ...defaultCalculatorState(),
            objective: 'monthly-net',
        },
    }),
}));

vi.mock('~/app/(app)/prop-calculator/_components/ShareLinkButton', () => ({
    default: (properties: {
        buildLink: (origin: string, pathname: string) => string;
    }) => {
        captured.buildLink = properties.buildLink;
        return null;
    },
}));

vi.mock('~/app/(app)/prop-calculator/_components/SavedScenarios', () => ({
    default: (properties: { encodeOptions: EncodeStateOptions }) => {
        captured.encodeOptions = properties.encodeOptions;
        return null;
    },
}));

describe('CalculatorToolbar hands the provider encode options to every link it builds (PT-63d, F-V15)', () => {
    let container: HTMLDivElement;
    let root: Root;

    beforeEach(() => {
        vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
        captured.buildLink = null;
        captured.encodeOptions = null;
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

    it('shares a deliberately chosen MonthlyNet explicitly and gives saved scenarios the same options', () => {
        provided.encodeOptions = { objectiveUrl: ObjectiveUrlMode.Explicit };
        act(() => {
            root.render(<CalculatorToolbar />);
        });
        const link = captured.buildLink?.(
            'https://sadra.nl',
            '/prop-calculator/sizing',
        );
        expect(
            new URL(link ?? 'https://invalid.example').searchParams.get(
                OBJECTIVE_URL_PARAMETER,
            ),
        ).toBe(SizingObjective.MonthlyNet);
        expect(captured.encodeOptions).toStrictEqual({
            objectiveUrl: ObjectiveUrlMode.Explicit,
        });
    });

    it('leaves MonthlyNet out of the link when the provider has no explicit pick', () => {
        provided.encodeOptions = { objectiveUrl: ObjectiveUrlMode.Natural };
        act(() => {
            root.render(<CalculatorToolbar />);
        });
        const link = captured.buildLink?.(
            'https://sadra.nl',
            '/prop-calculator/sizing',
        );
        expect(
            new URL(link ?? 'https://invalid.example').searchParams.has(
                OBJECTIVE_URL_PARAMETER,
            ),
        ).toBe(false);
    });
});
