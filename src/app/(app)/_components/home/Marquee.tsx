import { cn } from '~/lib/utilities';

export function Marquee({ words }: { readonly words: readonly string[] }) {
    const loop = [...words, ...words, ...words, ...words];
    return (
        <div
            aria-hidden
            className="relative h-[0.86em] overflow-hidden border-t border-line-faint text-[clamp(88px,15vw,240px)]"
        >
            <div className="flex w-max animate-marquee pt-[0.08em] font-serif leading-none font-medium tracking-[-0.03em] whitespace-nowrap italic">
                {loop.map((word, index) => (
                    <span
                        className="flex items-center gap-[0.3em] pr-[0.3em]"
                        key={`${word}-${String(index)}`}
                    >
                        <span
                            className={cn(
                                'text-transparent transition-[color,-webkit-text-stroke-color] duration-600 [-webkit-text-stroke:1px_var(--line-strong)] hover:text-ink hover:[-webkit-text-stroke-color:var(--ink)]',
                            )}
                        >
                            {word}
                        </span>
                        <span className="text-[0.32em] text-camel not-italic">
                            ✦
                        </span>
                    </span>
                ))}
            </div>
        </div>
    );
}
