import { Check, Heart } from 'lucide-react';

import { cn } from '~/lib/utilities';
import { type RouterOutputs } from '~/trpc/react';

export type ThemeSummaryView =
    RouterOutputs['user']['theme']['catalog']['items'][number];

export function ThemeCard({
    disabled,
    isActive,
    onSelect,
    theme,
}: {
    readonly disabled: boolean;
    readonly isActive: boolean;
    readonly onSelect: () => void;
    readonly theme: ThemeSummaryView;
}) {
    return (
        <button
            aria-pressed={isActive}
            className={cn(
                'app-profile__theme-card',
                'flex w-full flex-col gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-accent disabled:opacity-60',
                isActive && 'border-primary ring-1 ring-primary',
            )}
            disabled={disabled}
            onClick={onSelect}
            type="button"
        >
            <span className="flex h-8 overflow-hidden rounded-md border">
                {theme.swatches.map((color, index) => (
                    <span
                        className="flex-1"
                        key={`${theme.id}-${String(index)}`}
                        style={{ backgroundColor: color }}
                    />
                ))}
            </span>
            <span className="flex items-start justify-between gap-2">
                <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">
                        {theme.name}
                    </span>
                    {theme.author !== null && (
                        <span className="block truncate text-xs text-muted-foreground">
                            {theme.author}
                        </span>
                    )}
                </span>
                {isActive ? (
                    <Check
                        aria-hidden
                        className="size-4 shrink-0 text-primary"
                    />
                ) : (
                    theme.likes !== null && (
                        <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground tabular-nums">
                            <Heart aria-hidden className="size-3" />
                            {String(theme.likes)}
                        </span>
                    )
                )}
            </span>
        </button>
    );
}
