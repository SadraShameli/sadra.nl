import { describe, expect, it } from 'vitest';

import { defaultCalculatorState } from '~/app/(app)/prop-calculator/_components/calculatorReducer';
import {
    legacyHashNavigation,
    nextUrl,
} from '~/app/(app)/prop-calculator/_components/calculatorUrlSync';
import {
    decodeState,
    encodeState,
    ObjectiveUrlMode,
} from '~/app/(app)/prop-calculator/_components/urlState';
import { isObjectiveInSearch } from '~/app/(app)/prop-calculator/_components/useCalculator';
import { ALL_FIRMS } from '~/lib/prop-calculator';
import { SizingObjective } from '~/lib/prop-calculator/advisor';
import { routes } from '~/lib/site/routes';

const ANALYSIS = routes.propCalculator.analysis;

describe('an explicit MonthlyNet is distinguishable from no objective in the URL (PT-63c, F-V15)', () => {
    it('leaves obj out for the default MonthlyNet, as before', () => {
        expect(encodeState(defaultCalculatorState()).has('obj')).toBe(false);
    });

    it('writes obj=monthly-net when MonthlyNet was chosen explicitly', () => {
        const parameters = encodeState(defaultCalculatorState(), {
            objectiveUrl: ObjectiveUrlMode.Explicit,
        });
        expect(parameters.get('obj')).toBe(SizingObjective.MonthlyNet);
        expect(isObjectiveInSearch(parameters.toString())).toBe(true);
    });

    it('decodes the explicit MonthlyNet back to MonthlyNet', () => {
        const parameters = encodeState(defaultCalculatorState(), {
            objectiveUrl: ObjectiveUrlMode.Explicit,
        });
        expect(
            decodeState(parameters, ALL_FIRMS, defaultCalculatorState())
                .objective,
        ).toBe(SizingObjective.MonthlyNet);
    });

    it('writes the other objectives the same with or without the flag', () => {
        const state = {
            ...defaultCalculatorState(),
            objective: SizingObjective.CycleCash,
        };
        expect(encodeState(state).toString()).toBe(
            encodeState(state, {
                objectiveUrl: ObjectiveUrlMode.Explicit,
            }).toString(),
        );
    });

    it('writes the objective the same under the natural mode as with no options', () => {
        const state = {
            ...defaultCalculatorState(),
            objective: SizingObjective.RuinFirst,
        };
        expect(
            encodeState(state, {
                objectiveUrl: ObjectiveUrlMode.Natural,
            }).toString(),
        ).toBe(encodeState(state).toString());
    });

    it('leaves a non MonthlyNet objective out of the URL when it was chosen automatically', () => {
        const state = {
            ...defaultCalculatorState(),
            objective: SizingObjective.RuinFirst,
        };
        expect(
            encodeState(state, {
                objectiveUrl: ObjectiveUrlMode.Omitted,
            }).has('obj'),
        ).toBe(false);
        expect(encodeState(state).get('obj')).toBe(SizingObjective.RuinFirst);
    });

    it('does not rewrite the address bar with the automatic objective', () => {
        const url = nextUrl(
            {
                ...defaultCalculatorState(),
                objective: SizingObjective.RuinFirst,
            },
            ANALYSIS,
            '',
            '',
            { objectiveUrl: ObjectiveUrlMode.Omitted },
        );
        expect(url).not.toContain('obj=');
    });

    it('keeps obj=monthly-net in the rewritten address bar URL', () => {
        const url = nextUrl(defaultCalculatorState(), ANALYSIS, '', '', {
            objectiveUrl: ObjectiveUrlMode.Explicit,
        });
        expect(url).toContain('obj=monthly-net');
    });

    it('keeps obj=monthly-net in a legacy hash redirect', () => {
        const navigation = legacyHashNavigation(
            defaultCalculatorState(),
            ANALYSIS,
            '#cash-flow',
            { objectiveUrl: ObjectiveUrlMode.Explicit },
        );
        expect(navigation?.target).toContain('obj=monthly-net');
    });

    it('treats an obj value that is not an objective as no objective in the link', () => {
        expect(isObjectiveInSearch('firm=topstep&obj=foo')).toBe(false);
        expect(isObjectiveInSearch('obj=')).toBe(false);
        expect(isObjectiveInSearch('obj=ruin-first')).toBe(true);
        expect(isObjectiveInSearch('obj=monthly-net')).toBe(true);
        expect(isObjectiveInSearch('firm=topstep')).toBe(false);
    });
});
