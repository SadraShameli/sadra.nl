import { routes } from '~/lib/site/routes';

import { type CalculatorState } from './types';
import { encodeState, type EncodeStateOptions } from './urlState';

export function simulatorHref(
    state: CalculatorState,
    encodeOptions?: EncodeStateOptions,
): string {
    return `${routes.propCalculator.simulator}?${encodeState(state, encodeOptions).toString()}`;
}
