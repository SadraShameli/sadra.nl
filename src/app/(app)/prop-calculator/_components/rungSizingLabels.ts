import { RungSizing } from '~/lib/prop-calculator';

export const RUNG_SIZING_OPTIONS: readonly RungSizing[] =
    Object.values(RungSizing);

export const RUNG_SIZING_LABELS: Readonly<Record<RungSizing, string>> = {
    [RungSizing.CapToCushion]: 'Cap to cushion',
    [RungSizing.SkipIfUnaffordable]: 'Skip trade',
};

export const RUNG_SIZING_OUTCOMES: Readonly<Record<RungSizing, string>> = {
    [RungSizing.CapToCushion]:
        'a rung bigger than the room left before the drawdown floor or the daily loss limit is cut down to that room and still placed.',
    [RungSizing.SkipIfUnaffordable]:
        'a rung bigger than the room left before the drawdown floor or the daily loss limit is not placed: the trade is skipped and the day ends.',
};

export const UNAFFORDABLE_RUNG_LABEL = 'Unaffordable rung';
