'use client';

import { useSyncExternalStore } from 'react';

import { MarketStatus, NyseBell } from '~/lib/site/NyseBell';
import { cn } from '~/lib/utilities';

const SECOND_MS = 1000;
const TICKS = Array.from({ length: 60 }, (_, index) => index);
const NUMERALS = [
    { className: 'inset-x-0 top-[13%] text-center', label: 'XII' },
    { className: 'top-1/2 right-[13%] -translate-y-1/2', label: 'III' },
    { className: 'inset-x-0 bottom-[12%] text-center', label: 'VI' },
    { className: 'top-1/2 left-[13%] -translate-y-1/2', label: 'IX' },
] as const;
const EMPTY_CLOCK = '--:--:--';
const HAND_CLASS =
    'absolute bottom-1/2 origin-bottom rounded-[3px] bg-ink shadow-[0_4px_10px_rgba(0,0,0,0.5)] transition-transform duration-350 ease-[cubic-bezier(0.4,2.2,0.6,1)] motion-reduce:transition-none';

export function Watch() {
    const second = useSyncExternalStore(
        subscribeToSeconds,
        currentSecond,
        noSecondDuringPrerender,
    );
    const bell =
        second === null ? null : new NyseBell(new Date(second * SECOND_MS));
    const isOpen = bell?.status === MarketStatus.Open;

    return (
        <figure
            aria-label="New York time and stock market status"
            className={cn(
                'app-footer__watch',
                'm-0 mx-auto flex min-w-0 flex-[0_1_380px] flex-col items-center gap-7',
            )}
        >
            <div className="relative aspect-square w-[min(360px,100%)] rounded-full bg-linear-150 from-metal-hi via-metal-mid via-35% to-metal-edge p-2.5 shadow-watch ring-1 ring-line">
                <div className="relative size-full overflow-hidden rounded-full bg-radial-[circle_at_50%_32%] from-glow to-metal-lo to-72% shadow-[inset_0_0_0_1px_var(--line),inset_0_20px_40px_rgba(0,0,0,0.35)]">
                    <div aria-hidden className="absolute inset-0">
                        {TICKS.map((tick) => (
                            <span
                                className={cn(
                                    'absolute top-[4%] left-1/2',
                                    tick % 5 === 0
                                        ? 'ml-[-1.5px] h-[6%] w-0.75 origin-[50%_766.7%] bg-camel'
                                        : 'ml-[-0.5px] h-[2.6%] w-px origin-[50%_1769.2%] bg-line-camel',
                                )}
                                key={tick}
                                style={{ rotate: `${String(tick * 6)}deg` }}
                            />
                        ))}
                    </div>

                    {NUMERALS.map((numeral) => (
                        <span
                            aria-hidden
                            className={cn(
                                'absolute type-display-item leading-none text-ink',
                                numeral.className,
                            )}
                            key={numeral.label}
                        >
                            {numeral.label}
                        </span>
                    ))}

                    <div className="absolute inset-x-0 top-[29%] flex flex-col items-center gap-1">
                        <span className="font-serif text-sm text-camel italic">
                            New York
                        </span>
                        <span className="type-micro tracking-[0.3em] text-ink-muted">
                            AUTOMATIC
                        </span>
                    </div>

                    <div className="absolute bottom-[25%] left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-full border border-line-strong bg-scrim px-2.5 py-1.25">
                        <span
                            className={cn(
                                'size-1.5 rounded-full',
                                isOpen ? 'bg-signal-open' : 'bg-signal-closed',
                            )}
                        />
                        <span className="type-micro text-ink">
                            NYSE {bell?.status ?? MarketStatus.Closed}
                        </span>
                    </div>

                    <div
                        aria-hidden
                        className={cn(
                            HAND_CLASS,
                            'left-[calc(50%-3px)] h-1/4 w-1.5',
                        )}
                        style={{
                            rotate: `${String(bell?.hourHandDegrees ?? 0)}deg`,
                        }}
                    />
                    <div
                        aria-hidden
                        className={cn(
                            HAND_CLASS,
                            'left-[calc(50%-2px)] h-[37%] w-1',
                        )}
                        style={{
                            rotate: `${String(bell?.minuteHandDegrees ?? 0)}deg`,
                        }}
                    />
                    <div
                        aria-hidden
                        className="absolute top-[10%] left-[calc(50%-0.75px)] h-1/2 w-[1.5px] origin-[50%_80%] bg-camel"
                        style={{
                            rotate: `${String(bell?.secondHandDegrees ?? 0)}deg`,
                        }}
                    />
                    <div
                        aria-hidden
                        className="absolute top-[calc(50%-7px)] left-[calc(50%-7px)] size-3.5 rounded-full bg-camel ring-3 ring-metal-lo"
                    />
                </div>
            </div>

            <figcaption className="flex flex-col items-center gap-2 text-center">
                <span className="type-micro tracking-[0.24em] text-ink-muted">
                    {isOpen ? 'Closing bell in' : 'Opening bell in'}
                </span>
                <span className="type-display-figure tracking-[0.01em] text-ink tabular-nums">
                    {bell?.countdown ?? EMPTY_CLOCK}
                </span>
                <span className="type-micro tracking-[0.16em] text-ink-muted">
                    {bell?.wallClock ?? EMPTY_CLOCK} ET · REGULAR HOURS
                </span>
            </figcaption>
        </figure>
    );
}

function currentSecond(): number {
    return Math.floor(Date.now() / SECOND_MS);
}

function noSecondDuringPrerender(): null {
    return null;
}

function subscribeToSeconds(onTick: () => void): () => void {
    const timer = setInterval(onTick, SECOND_MS);
    return () => clearInterval(timer);
}
