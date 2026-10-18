'use client';

import { ToolPanel } from '~/components/ToolPanel';
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from '~/components/ui/tooltip';

interface PercentileBarProperties {
    description: string;
    formatValue: (n: number) => string;
    label: string;
    p5: number;
    p25: number;
    p50: number;
    p75: number;
    p95: number;
    referenceLine?: { label: string; value: number };
}

export default function PercentileBar({
    description,
    formatValue,
    label,
    p5,
    p25,
    p50,
    p75,
    p95,
    referenceLine,
}: PercentileBarProperties) {
    const rangeMin = Math.min(p5, referenceLine?.value ?? p5);
    const rangeMax = Math.max(p95, referenceLine?.value ?? p95);
    const span = Math.max(1, rangeMax - rangeMin);
    const pct = (v: number) => ((v - rangeMin) / span) * 100;

    return (
        <ToolPanel
            className="app-prop-calculator__percentile-bar"
            contentClassName="gap-2"
            info={description}
            title={label}
            titleAs="h3"
        >
            <div className="relative h-8">
                <div
                    className="absolute top-1/2 h-px -translate-y-1/2 bg-border"
                    style={{
                        left: `${pct(p5)}%`,
                        width: `${pct(p95) - pct(p5)}%`,
                    }}
                />
                {[p5, p95].map((v, index) => (
                    <div
                        className="absolute top-1/4 h-1/2 w-px bg-border"
                        key={index}
                        style={{ left: `${pct(v)}%` }}
                    />
                ))}
                <div
                    className="absolute top-1/4 h-1/2 rounded-sm bg-primary/30"
                    style={{
                        left: `${pct(p25)}%`,
                        width: `${pct(p75) - pct(p25)}%`,
                    }}
                />
                <div
                    className="absolute top-1/4 h-1/2 w-0.5 rounded-full bg-primary"
                    style={{ left: `${pct(p50)}%` }}
                />
                {referenceLine && (
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <div
                                className="absolute top-0 h-full w-px border-l border-dashed border-success/70"
                                style={{ left: `${pct(referenceLine.value)}%` }}
                            />
                        </TooltipTrigger>
                        <TooltipContent>
                            {referenceLine.label}:{' '}
                            {formatValue(referenceLine.value)}
                        </TooltipContent>
                    </Tooltip>
                )}
            </div>

            <div className="grid grid-cols-5 gap-1 font-mono text-xs text-muted-foreground tabular-nums">
                <div>
                    <div className="type-micro">P5</div>
                    <div className="text-foreground">{formatValue(p5)}</div>
                </div>
                <div>
                    <div className="type-micro">P25</div>
                    <div className="text-foreground">{formatValue(p25)}</div>
                </div>
                <div>
                    <div className="type-micro">P50</div>
                    <div className="font-semibold text-foreground">
                        {formatValue(p50)}
                    </div>
                </div>
                <div>
                    <div className="type-micro">P75</div>
                    <div className="text-foreground">{formatValue(p75)}</div>
                </div>
                <div>
                    <div className="type-micro">P95</div>
                    <div className="text-foreground">{formatValue(p95)}</div>
                </div>
            </div>
        </ToolPanel>
    );
}
