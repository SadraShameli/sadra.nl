import { type BadgeProperties } from '~/components/ui/Badge';
import { ScaleGateStatus } from '~/lib/prop-accounts/bankroll';

export const SCALE_GATE_STATUS_VARIANT: Readonly<
    Record<ScaleGateStatus, BadgeProperties['variant']>
> = {
    [ScaleGateStatus.NotEnoughSample]: 'warning',
    [ScaleGateStatus.NotPositiveAfterCost]: 'warning',
    [ScaleGateStatus.Ready]: 'outline',
    [ScaleGateStatus.ThresholdsNotSet]: 'secondary',
};
