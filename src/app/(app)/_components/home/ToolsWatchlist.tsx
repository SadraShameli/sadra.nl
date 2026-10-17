import { ArrowUpRight } from 'lucide-react';
import Link from 'next/link';

import { type SiteTool, siteTools } from '~/lib/site/content';
import { cn } from '~/lib/utilities';

export function ToolsWatchlist() {
    return (
        <div className={cn('app-home__watchlist', 'flex flex-col')}>
            <div className="flex gap-6 border-b border-line px-5 pb-3.5 type-micro text-ink-muted">
                <span className="w-27.5 shrink-0">Ticker</span>
                <span className="flex-auto">Tool</span>
                <span>Open</span>
            </div>
            <ul className="m-0 list-none p-0">
                {siteTools.map((tool) => (
                    <li key={tool.ticker}>
                        <WatchlistRow tool={tool} />
                    </li>
                ))}
            </ul>
        </div>
    );
}

function WatchlistRow({ tool }: { readonly tool: SiteTool }) {
    return (
        <Link
            className="group flex flex-wrap items-center gap-6 border-b border-line-faint px-5 py-8 text-ink focus-camel transition-[background-color,padding] duration-300 hover:bg-surface hover:pl-9 motion-reduce:transition-none"
            href={tool.href}
        >
            <span className="w-27.5 shrink-0 type-ticker text-camel">
                {tool.ticker}
            </span>
            <span className="flex min-w-0 flex-[1_1_320px] flex-col gap-2.5">
                <span className="type-display-title">{tool.title}</span>
                <span className="text-base font-light text-ink-muted">
                    {tool.description}
                </span>
            </span>
            <svg
                aria-hidden
                className="h-12 w-40 shrink-0"
                viewBox="0 0 160 48"
            >
                <polyline
                    className="fill-none stroke-line-camel"
                    points={tool.sparkline}
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                />
            </svg>
            <span className="flex size-14 shrink-0 items-center justify-center rounded-full border border-line-strong transition duration-300 group-hover:rotate-45 group-hover:border-camel group-hover:bg-camel group-hover:text-on-camel motion-reduce:transition-none">
                <ArrowUpRight
                    aria-hidden
                    className="size-5"
                    strokeWidth={1.6}
                />
            </span>
        </Link>
    );
}
