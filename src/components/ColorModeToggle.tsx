'use client';

import { Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';

import { oppositeColorMode, parseColorMode } from '~/lib/theme';
import { cn } from '~/lib/utilities';

export function ColorModeToggle({
    className,
}: {
    readonly className?: string;
}) {
    const { resolvedTheme, setTheme } = useTheme();
    return (
        <button
            aria-label="Toggle light and dark mode"
            className={cn(
                'flex size-5 items-center justify-center transition hover:opacity-50',
                className,
            )}
            onClick={() => {
                setTheme(oppositeColorMode(parseColorMode(resolvedTheme)));
            }}
            type="button"
        >
            <Sun aria-hidden className="hidden size-5 dark:block" />
            <Moon aria-hidden className="size-5 dark:hidden" />
        </button>
    );
}
