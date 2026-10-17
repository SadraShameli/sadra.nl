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
            className={cn('flex items-center justify-center', className)}
            onClick={() => {
                setTheme(oppositeColorMode(parseColorMode(resolvedTheme)));
            }}
            type="button"
        >
            <Sun aria-hidden className="hidden dark:block" strokeWidth={1.6} />
            <Moon aria-hidden className="dark:hidden" strokeWidth={1.6} />
        </button>
    );
}
