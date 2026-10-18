import { HeatScale } from '~/components/ui/heat-scale';

const HEAT_LEVEL_COUNT = 5;

const HEAT_LEVEL_SCALE = HeatScale.between(0, HEAT_LEVEL_COUNT - 1);

export const HEAT_LEVEL_CLASS: readonly string[] = Array.from(
    { length: HEAT_LEVEL_COUNT },
    (_, level) => HEAT_LEVEL_SCALE.tileClassName(level),
);
