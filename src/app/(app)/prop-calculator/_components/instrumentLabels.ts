import { formatWholeOrCentsCurrency } from '~/lib/format';
import { type InstrumentSpec } from '~/lib/prop-calculator';

export function instrumentPointValueLabel(spec: InstrumentSpec): string {
    return `${spec.symbol} (${formatWholeOrCentsCurrency(spec.pointValue)}/pt)`;
}
