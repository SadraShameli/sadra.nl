'use client';

import { Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';

import { Button } from '~/components/ui/Button';
import { oppositeColorMode, parseColorMode } from '~/lib/theme';

export function ColorModeToggle({
    className,
}: {
    readonly className?: string;
}) {
    const { resolvedTheme, setTheme } = useTheme();
    return (
        <Button
            aria-label="Toggle light and dark mode"
            className={className}
            onClick={() => {
                setTheme(oppositeColorMode(parseColorMode(resolvedTheme)));
            }}
            size="icon-tap"
            type="button"
            variant="capsule"
        >
            <Sun aria-hidden className="hidden dark:block" strokeWidth={1.6} />
            <Moon aria-hidden className="dark:hidden" strokeWidth={1.6} />
        </Button>
    );
}
