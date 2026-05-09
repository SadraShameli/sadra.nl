'use client';

import { Card } from '~/components/ui/Card';

import InfoPopover from './InfoPopover';

interface PercentileBarProps {
    label: string;
    p5: number;
    p25: number;
    p50: number;
    p75: number;
    p95: number;
    formatValue: (n: number) => string;
    description: string;
    referenceLine?: { value: number; label: string };
}

export default function PercentileBar({
    label,
    p5,
    p25,
    p50,
    p75,
    p95,
    formatValue,
    description,
    referenceLine,
}: PercentileBarProps) {
    const rangeMin = Math.min(p5, referenceLine?.value ?? p5);
    const rangeMax = Math.max(p95, referenceLine?.value ?? p95);
    const span = Math.max(1, rangeMax - rangeMin);
    const pct = (v: number) => ((v - rangeMin) / span) * 100;

    return (
        <Card className="gap-2 px-5 py-4">
            <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                    {label}
                </span>
                <InfoPopover title={label}>{description}</InfoPopover>
            </div>

            <div className="relative mt-1 h-8">
                <div
                    className="absolute top-1/2 h-px -translate-y-1/2 bg-border"
                    style={{
                        left: `${pct(p5)}%`,
                        width: `${pct(p95) - pct(p5)}%`,
                    }}
                />
                {[p5, p95].map((v, i) => (
                    <div
                        key={i}
                        className="absolute top-1/4 h-1/2 w-px bg-border"
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
                    <div
                        className="absolute top-0 h-full w-px border-l border-dashed border-emerald-400/70"
                        style={{ left: `${pct(referenceLine.value)}%` }}
                        title={`${referenceLine.label}: ${formatValue(referenceLine.value)}`}
                    />
                )}
            </div>

            <div className="grid grid-cols-5 gap-1 font-mono text-[10px] text-muted-foreground tabular-nums">
                <div>
                    <div className="text-[9px] tracking-wide uppercase">P5</div>
                    <div className="text-foreground">{formatValue(p5)}</div>
                </div>
                <div>
                    <div className="text-[9px] tracking-wide uppercase">
                        P25
                    </div>
                    <div className="text-foreground">{formatValue(p25)}</div>
                </div>
                <div>
                    <div className="text-[9px] tracking-wide uppercase">
                        P50
                    </div>
                    <div className="font-semibold text-foreground">
                        {formatValue(p50)}
                    </div>
                </div>
                <div>
                    <div className="text-[9px] tracking-wide uppercase">
                        P75
                    </div>
                    <div className="text-foreground">{formatValue(p75)}</div>
                </div>
                <div>
                    <div className="text-[9px] tracking-wide uppercase">
                        P95
                    </div>
                    <div className="text-foreground">{formatValue(p95)}</div>
                </div>
            </div>
        </Card>
    );
}
