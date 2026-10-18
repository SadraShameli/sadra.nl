'use client';

import { type CSSProperties, useMemo } from 'react';

import { Card, CardContent } from '~/components/ui/card';
import { WeightUnit } from '~/lib/lifting/format';
import {
    PlateCalculator,
    type PlateLoad,
} from '~/lib/lifting/math/plate-calculator';
import { type UnitWeight } from '~/lib/lifting/types';
import { cn } from '~/lib/utilities';

interface PlateVisualizerProperties {
    availableKg: readonly number[];
    barKg: number;
    className?: string;
    targetKg: number;
    unitWeight: UnitWeight;
}

const PLATE_SIZE_CAP_KG = 25;

const PLATE_CLASS =
    'flex items-center justify-center rounded-sm border border-line-strong bg-surface-high px-1 type-micro tracking-normal text-ink tabular-nums';

export function PlateVisualizer({
    availableKg,
    barKg,
    className,
    targetKg,
    unitWeight,
}: PlateVisualizerProperties) {
    const load: PlateLoad = useMemo(() => {
        const calc = new PlateCalculator(barKg, availableKg);
        return calc.load(targetKg);
    }, [barKg, availableKg, targetKg]);

    const perSideString =
        load.perSide.length === 0
            ? '-'
            : load.perSide.map((p) => p.toString()).join(' · ');

    return (
        <Card
            className={cn(
                'gap-2 border-border/30 bg-background/40 py-3',
                className,
            )}
        >
            <CardContent className="flex flex-col gap-2 px-3">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>Per side</span>
                    <span className="tabular-nums">
                        {WeightUnit.format(load.totalLoadedKg, unitWeight)}
                        {load.remainderKg > 0 && (
                            <span className="ml-1 text-ink">
                                (
                                {WeightUnit.toDisplay(
                                    load.remainderKg,
                                    unitWeight,
                                ).toFixed(2)}{' '}
                                short)
                            </span>
                        )}
                    </span>
                </div>
                <div className="flex items-center justify-center gap-1">
                    {[...load.perSide].toReversed().map((weight, index) => (
                        <div
                            className={PLATE_CLASS}
                            key={`${weight}-${index}`}
                            style={plateSize(weight)}
                        >
                            {weight}
                        </div>
                    ))}
                    <div className="h-3 flex-1 rounded-full bg-muted-foreground/60" />
                    <div className="flex h-10 w-3 items-center justify-center bg-muted-foreground/80 type-micro font-bold tracking-normal text-background">
                        |
                    </div>
                    <div className="h-3 flex-1 rounded-full bg-muted-foreground/60" />
                    {load.perSide.map((weight, index) => (
                        <div
                            className={PLATE_CLASS}
                            key={`r-${weight}-${index}`}
                            style={plateSize(weight)}
                        >
                            {weight}
                        </div>
                    ))}
                </div>
                <div className="text-center text-xs text-muted-foreground tabular-nums">
                    {perSideString}
                </div>
            </CardContent>
        </Card>
    );
}

function plateSize(weight: number): CSSProperties {
    const scale = Math.min(weight, PLATE_SIZE_CAP_KG);
    return { height: 36 + scale * 2, width: 12 + scale * 0.5 };
}
