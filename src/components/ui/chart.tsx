'use client';

import * as React from 'react';
import * as RechartsPrimitive from 'recharts';

import { Skeleton } from '~/components/ui/skeleton';
import { cn } from '~/lib/utilities';

const THEMES = { dark: '.dark', light: '' } as const;

export type ChartConfig = Record<
    string,
    (
        | { color?: never; theme: Record<keyof typeof THEMES, string> }
        | { color?: string; theme?: never }
    ) & {
        icon?: React.ComponentType;
        label?: React.ReactNode;
    }
>;

type ChartContextProperties = {
    config: ChartConfig;
};

const ChartContext = React.createContext<ChartContextProperties | null>(null);

export enum ChartSize {
    Compact = 'compact',
    Standard = 'standard',
    Tall = 'tall',
}

function useChart() {
    const context = React.useContext(ChartContext);

    if (!context) {
        throw new Error('useChart must be used within a <ChartContainer />');
    }

    return context;
}

const CHART_SIZE_CLASS: Readonly<Record<ChartSize, string>> = {
    [ChartSize.Compact]: 'h-56',
    [ChartSize.Standard]: 'h-64 lg:h-80',
    [ChartSize.Tall]: 'h-80 lg:h-96',
};

export function ChartSkeleton({
    size = ChartSize.Standard,
}: {
    readonly size?: ChartSize;
}) {
    return (
        <Skeleton className={cn('w-full rounded-md', CHART_SIZE_CLASS[size])} />
    );
}

export const CHART_X_AXIS_PROPS = {
    axisLine: false,
    tickLine: false,
    tickMargin: 10,
} as const;

export const CHART_Y_AXIS_PROPS = {
    axisLine: false,
    tickLine: false,
    width: 'auto',
} as const;

export const CHART_REFERENCE_LINE_PROPS = {
    stroke: 'var(--line-strong)',
    strokeDasharray: '4 4',
} as const;

export const CHART_STROKE_WIDTH = 1.6;

const CHART_BAR_RADIUS: [number, number, number, number] = [3, 3, 0, 0];

export const CHART_BAR_PROPS = {
    isAnimationActive: false,
    maxBarSize: 48,
    radius: CHART_BAR_RADIUS,
} as const;

const ChartContainer = React.forwardRef<
    HTMLDivElement,
    React.ComponentProps<'div'> & {
        children: React.ComponentProps<
            typeof RechartsPrimitive.ResponsiveContainer
        >['children'];
        config: ChartConfig;
        size?: ChartSize;
    }
>(
    (
        {
            children,
            className,
            config,
            id,
            size = ChartSize.Standard,
            ...properties
        },
        reference,
    ) => {
        const uniqueId = React.useId();
        const chartId = `chart-${id ?? uniqueId.replaceAll(':', '')}`;
        const [mounted, setMounted] = React.useState(false);
        React.useEffect(() => setMounted(true), []);

        return (
            <ChartContext.Provider value={{ config }}>
                <div
                    className={cn(
                        'w-full min-w-0 rounded-md border border-line-faint chart-well p-5',
                        CHART_SIZE_CLASS[size],
                        className,
                    )}
                    data-slot="chart"
                    ref={reference}
                    {...properties}
                >
                    <div
                        className="flex size-full justify-center text-xs [&_.recharts-cartesian-axis-tick_text]:fill-ink-muted [&_.recharts-curve.recharts-tooltip-cursor]:stroke-line-strong [&_.recharts-dot[stroke='#fff']]:stroke-transparent [&_.recharts-layer]:outline-none [&_.recharts-polar-grid_[stroke='#ccc']]:stroke-line [&_.recharts-radial-bar-background-sector]:fill-muted [&_.recharts-rectangle.recharts-tooltip-cursor]:fill-surface-sunken [&_.recharts-sector]:outline-none [&_.recharts-sector[stroke='#fff']]:stroke-transparent [&_.recharts-surface]:outline-none"
                        data-chart={chartId}
                    >
                        <ChartStyle config={config} id={chartId} />
                        {mounted && (
                            <RechartsPrimitive.ResponsiveContainer
                                height="100%"
                                minHeight={0}
                                minWidth={0}
                                width="100%"
                            >
                                {children}
                            </RechartsPrimitive.ResponsiveContainer>
                        )}
                    </div>
                </div>
            </ChartContext.Provider>
        );
    },
);
ChartContainer.displayName = 'Chart';

const CSS_IDENTIFIER = /^[\w-]+$/u;

const ChartStyle = ({ config, id }: { config: ChartConfig; id: string }) => {
    const colorConfig = Object.entries(config).filter(
        ([key, config]) =>
            CSS_IDENTIFIER.test(key) && (config.theme ?? config.color),
    );

    return colorConfig.length === 0 ? null : (
        <style
            dangerouslySetInnerHTML={{
                __html: Object.entries(THEMES)
                    .map(
                        ([theme, prefix]) => `
${prefix} [data-chart=${id}] {
${colorConfig
    .map(([key, itemConfig]) => {
        const color =
            itemConfig.theme?.[theme as keyof typeof itemConfig.theme] ??
            itemConfig.color;
        return color ? `  --color-${key}: ${color};` : null;
    })
    .join('\n')}
}
`,
                    )
                    .join('\n'),
            }}
        />
    );
};

const ChartTooltip = RechartsPrimitive.Tooltip;

const ChartTooltipContent = React.forwardRef<
    HTMLDivElement,
    React.ComponentProps<'div'> &
        RechartsPrimitive.TooltipProps & {
            color?: string;
            hideIndicator?: boolean;
            hideLabel?: boolean;
            indicator?: 'dashed' | 'dot' | 'line';
            label?: React.ReactNode;
            labelClassName?: string;
            labelKey?: string;
            nameKey?: string;
            payload?: readonly RechartsPrimitive.TooltipPayloadEntry[];
            valueFormatter?: (value: number) => string;
        }
>(
    (
        {
            active,
            className,
            color,
            formatter,
            hideIndicator = false,
            hideLabel = false,
            indicator = 'dot',
            label,
            labelClassName,
            labelFormatter,
            labelKey,
            nameKey,
            payload,
            valueFormatter,
        },
        reference,
    ) => {
        const { config } = useChart();

        function tooltipLabelOf() {
            if (hideLabel || !payload?.length) {
                return null;
            }

            const [item] = payload;
            const key = String(
                labelKey ?? item?.dataKey ?? item?.name ?? 'value',
            );
            const itemConfig = getPayloadConfigFromPayload(config, item, key);
            const value =
                !labelKey && typeof label === 'string'
                    ? (config[label]?.label ?? label)
                    : itemConfig?.label;

            if (labelFormatter) {
                return (
                    <div
                        className={cn(
                            'type-micro text-ink-muted',
                            labelClassName,
                        )}
                    >
                        {labelFormatter(value, payload)}
                    </div>
                );
            }

            return value ? (
                <div
                    className={cn('type-micro text-ink-muted', labelClassName)}
                >
                    {value}
                </div>
            ) : null;
        }

        if (!active || !payload?.length) {
            return null;
        }

        const tooltipLabel = tooltipLabelOf();

        const isNestLabel = payload.length === 1 && indicator !== 'dot';

        return (
            <div
                className={cn(
                    'grid min-w-40 items-start gap-2 rounded-md border border-line bg-surface-raised px-3 py-2.5 text-xs shadow-float',
                    className,
                )}
                ref={reference}
            >
                {isNestLabel ? null : tooltipLabel}
                <div className="grid gap-1.5">
                    {payload
                        .filter(
                            (item: RechartsPrimitive.TooltipPayloadEntry) =>
                                item.type !== 'none',
                        )
                        .map(
                            (
                                item: RechartsPrimitive.TooltipPayloadEntry,
                                index: number,
                            ) => {
                                const key = String(
                                    nameKey ??
                                        item.name ??
                                        item.dataKey ??
                                        'value',
                                );
                                const itemConfig = getPayloadConfigFromPayload(
                                    config,
                                    item,
                                    key,
                                );
                                const indicatorColor =
                                    color ??
                                    (
                                        item.payload as
                                            undefined | { fill?: string }
                                    )?.fill ??
                                    item.color;

                                return (
                                    <div
                                        className={cn(
                                            'flex w-full flex-wrap items-stretch gap-2 [&>svg]:size-2.5 [&>svg]:text-muted-foreground',
                                            indicator === 'dot' &&
                                                'items-center',
                                        )}
                                        key={String(item.dataKey ?? index)}
                                    >
                                        {formatter &&
                                        item.value !== undefined &&
                                        item.name ? (
                                            formatter(
                                                item.value,
                                                item.name,
                                                item,
                                                index,
                                                payload,
                                            )
                                        ) : (
                                            <>
                                                {itemConfig?.icon ? (
                                                    <itemConfig.icon />
                                                ) : (
                                                    !hideIndicator && (
                                                        <div
                                                            className={cn(
                                                                'shrink-0 rounded-xs border-border bg-(--color-bg)',
                                                                {
                                                                    'my-0.5':
                                                                        isNestLabel &&
                                                                        indicator ===
                                                                            'dashed',
                                                                    'size-2.5':
                                                                        indicator ===
                                                                        'dot',
                                                                    'w-0 border-[1.5px] border-dashed bg-transparent':
                                                                        indicator ===
                                                                        'dashed',
                                                                    'w-1':
                                                                        indicator ===
                                                                        'line',
                                                                },
                                                            )}
                                                            style={
                                                                {
                                                                    '--color-bg':
                                                                        indicatorColor,
                                                                    '--color-border':
                                                                        indicatorColor,
                                                                } as React.CSSProperties
                                                            }
                                                        />
                                                    )
                                                )}
                                                <div
                                                    className={cn(
                                                        'flex flex-1 justify-between gap-4 leading-none',
                                                        isNestLabel
                                                            ? 'items-end'
                                                            : 'items-center',
                                                    )}
                                                >
                                                    <div className="grid gap-1.5">
                                                        {isNestLabel
                                                            ? tooltipLabel
                                                            : null}
                                                        <span className="text-ink-soft">
                                                            {itemConfig?.label ??
                                                                item.name}
                                                        </span>
                                                    </div>
                                                    {item.value !==
                                                        undefined && (
                                                        <span className="font-mono font-medium whitespace-nowrap text-ink tabular-nums">
                                                            {valueFormatter &&
                                                            typeof item.value ===
                                                                'number'
                                                                ? valueFormatter(
                                                                      item.value,
                                                                  )
                                                                : item.value.toLocaleString()}
                                                        </span>
                                                    )}
                                                </div>
                                            </>
                                        )}
                                    </div>
                                );
                            },
                        )}
                </div>
            </div>
        );
    },
);
ChartTooltipContent.displayName = 'ChartTooltip';

const ChartLegend = RechartsPrimitive.Legend;

const ChartLegendContent = React.forwardRef<
    HTMLDivElement,
    Omit<RechartsPrimitive.LegendProps, 'verticalAlign'> &
        React.ComponentProps<'div'> & {
            hideIcon?: boolean;
            nameKey?: string;
            payload?: readonly RechartsPrimitive.LegendPayload[];
            verticalAlign?: 'bottom' | 'middle' | 'top';
        }
>(
    (
        {
            className,
            hideIcon = false,
            nameKey,
            payload,
            verticalAlign = 'bottom',
        },
        reference,
    ) => {
        const { config } = useChart();

        return payload?.length ? (
            <div
                className={cn(
                    'flex items-center justify-center gap-4',
                    verticalAlign === 'top' ? 'pb-3' : 'pt-3',
                    className,
                )}
                ref={reference}
            >
                {payload
                    .filter(
                        (item: RechartsPrimitive.LegendPayload) =>
                            item.type !== 'none',
                    )
                    .map((item: RechartsPrimitive.LegendPayload) => {
                        const key = String(nameKey ?? item.dataKey ?? 'value');
                        const itemConfig = getPayloadConfigFromPayload(
                            config,
                            item,
                            key,
                        );

                        return (
                            <div
                                className={cn(
                                    'flex items-center gap-1.5 [&>svg]:size-3 [&>svg]:text-muted-foreground',
                                )}
                                key={item.value}
                            >
                                {!hideIcon && itemConfig?.icon ? (
                                    <itemConfig.icon />
                                ) : (
                                    <div
                                        className="size-2 shrink-0 rounded-xs"
                                        style={{
                                            backgroundColor: item.color,
                                        }}
                                    />
                                )}
                                {itemConfig?.label}
                            </div>
                        );
                    })}
            </div>
        ) : null;
    },
);
ChartLegendContent.displayName = 'ChartLegend';

function getPayloadConfigFromPayload(
    config: ChartConfig,
    payload: unknown,
    key: string,
) {
    if (typeof payload !== 'object' || payload === null) {
        return;
    }

    const payloadPayload =
        'payload' in payload &&
        typeof payload.payload === 'object' &&
        payload.payload !== null
            ? payload.payload
            : undefined;

    let configLabelKey: string = key;

    if (
        Object.hasOwn(payload, key) &&
        typeof payload[key as keyof typeof payload] === 'string'
    ) {
        configLabelKey = payload[key as keyof typeof payload];
    } else if (
        payloadPayload &&
        Object.hasOwn(payloadPayload, key) &&
        typeof payloadPayload[key as keyof typeof payloadPayload] === 'string'
    ) {
        configLabelKey = payloadPayload[key as keyof typeof payloadPayload];
    }

    return config[Object.hasOwn(config, configLabelKey) ? configLabelKey : key];
}

export {
    ChartContainer,
    ChartLegend,
    ChartLegendContent,
    ChartStyle,
    ChartTooltip,
    ChartTooltipContent,
};
