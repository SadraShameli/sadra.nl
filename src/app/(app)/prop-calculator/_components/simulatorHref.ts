import { type PathWithQuery, routes } from '~/lib/site/routes';

import { pageEncodeOptions } from './calculatorUrlSync';
import { type CalculatorState } from './types';
import { encodeState, type EncodeStateOptions } from './urlState';

export function simulatorHref(
    state: CalculatorState,
    encodeOptions?: EncodeStateOptions,
): PathWithQuery<typeof routes.propCalculator.simulator> {
    return `${routes.propCalculator.simulator}?${encodeState(state, pageEncodeOptions(routes.propCalculator.simulator, encodeOptions)).toString()}` as const;
}
