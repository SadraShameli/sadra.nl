import { ArrowUpRight } from 'lucide-react';
import Link from 'next/link';
import { useId } from 'react';

import { CHART_STROKE_WIDTH } from '~/components/ui/Chart';
import { ChartAreaGradient } from '~/components/ui/Chart/ChartAreaGradient';
import { type SiteTool, siteTools } from '~/lib/site/content';
import { cn } from '~/lib/utilities';

const SPARKLINE_WIDTH = 160;
const SPARKLINE_HEIGHT = 48;

export function ToolCards() {
    return (
        <ul
            className={cn(
                'app-home__tools',
                'm-0 grid list-none gap-4 p-0 md:grid-cols-2 xl:grid-cols-4',
            )}
        >
            {siteTools.map((tool) => (
                <li className="flex" key={tool.ticker}>
                    <ToolCard tool={tool} />
                </li>
            ))}
        </ul>
    );
}

function ToolCard({ tool }: { readonly tool: SiteTool }) {
    const gradientId = useId();
    return (
        <Link
            className="group flex w-full flex-col gap-8 rounded-xl border border-line bg-surface p-6 text-ink focus-camel transition-colors duration-300 hover:border-line-hover hover:bg-surface-raised motion-reduce:transition-none"
            href={tool.href}
        >
            <span className="flex items-center justify-between gap-4">
                <span className="type-ticker text-camel">{tool.ticker}</span>
                <span className="flex size-10 items-center justify-center rounded-full border border-line-strong transition duration-300 group-hover:rotate-45 group-hover:border-camel group-hover:selected-pill motion-reduce:transition-none">
                    <ArrowUpRight
                        aria-hidden
                        className="size-4"
                        strokeWidth={1.6}
                    />
                </span>
            </span>
            <svg
                aria-hidden
                className="h-16 w-full"
                preserveAspectRatio="none"
                viewBox={`0 0 ${String(SPARKLINE_WIDTH)} ${String(SPARKLINE_HEIGHT)}`}
            >
                <defs>
                    <ChartAreaGradient id={gradientId} />
                </defs>
                <polygon
                    fill={`url(#${gradientId})`}
                    points={`${tool.sparkline} ${String(SPARKLINE_WIDTH)},${String(SPARKLINE_HEIGHT)} 0,${String(SPARKLINE_HEIGHT)}`}
                />
                <polyline
                    className="fill-none stroke-camel"
                    points={tool.sparkline}
                    strokeLinejoin="round"
                    strokeWidth={CHART_STROKE_WIDTH}
                    vectorEffect="non-scaling-stroke"
                />
            </svg>
            <span className="flex flex-col gap-2">
                <span className="type-display-item">{tool.title}</span>
                <span className="text-sm text-ink-muted">
                    {tool.description}
                </span>
            </span>
        </Link>
    );
}
