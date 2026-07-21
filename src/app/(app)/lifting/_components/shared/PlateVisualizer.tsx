'use client';

import { useMemo } from 'react';

import { Card, CardContent } from '~/components/ui/Card';
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

const PLATE_COLORS: Record<string, string> = {
    '1.25': '#9ca3af',
    '2.5': '#94a3b8',
    '5': '#3b82f6',
    '10': '#22c55e',
    '15': '#eab308',
    '20': '#ef4444',
    '25': '#dc2626',
};

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
            ? '—'
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
                            <span className="ml-1 text-destructive">
                                (−
                                {WeightUnit.toDisplay(
                                    load.remainderKg,
                                    unitWeight,
                                ).toFixed(2)}
                                )
                            </span>
                        )}
                    </span>
                </div>
                <div className="flex items-center justify-center gap-1">
                    {[...load.perSide].toReversed().map((weight, index) => (
                        <div
                            className="flex items-center justify-center rounded-sm px-1 text-[10px] font-bold text-black tabular-nums"
                            key={`${weight}-${index}`}
                            style={{
                                backgroundColor: getColor(weight),
                                height: 36 + Math.min(weight, 20) * 2,
                                width: 12 + Math.min(weight, 20) * 0.5,
                            }}
                        >
                            {weight}
                        </div>
                    ))}
                    <div className="h-3 flex-1 rounded-full bg-muted-foreground/60" />
                    <div className="flex h-10 w-3 items-center justify-center bg-muted-foreground/80 text-[10px] font-bold text-black">
                        |
                    </div>
                    <div className="h-3 flex-1 rounded-full bg-muted-foreground/60" />
                    {load.perSide.map((weight, index) => (
                        <div
                            className="flex items-center justify-center rounded-sm px-1 text-[10px] font-bold text-black tabular-nums"
                            key={`r-${weight}-${index}`}
                            style={{
                                backgroundColor: getColor(weight),
                                height: 36 + Math.min(weight, 20) * 2,
                                width: 12 + Math.min(weight, 20) * 0.5,
                            }}
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

function getColor(weight: number): string {
    return PLATE_COLORS[weight.toString()] ?? '#6b7280';
}
