import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuRadioGroup,
    DropdownMenuRadioItem,
    DropdownMenuTrigger,
} from '~/components/ui/dropdown-menu';
import { cn } from '~/lib/utilities';

import { PLAYBACK_SPEEDS, type PlaybackSpeed } from './types';

interface SpeedControlProperties {
    hasRecordings: boolean;
    onSpeedChange: (speed: PlaybackSpeed) => void;
    speed: PlaybackSpeed;
}

export function SpeedControl({
    hasRecordings,
    onSpeedChange,
    speed,
}: SpeedControlProperties) {
    return (
        <DropdownMenu>
            <DropdownMenuTrigger
                aria-label="Playback speed"
                className={cn(
                    'app-recording__speed',
                    'inline-flex h-11 min-w-16 items-center justify-center rounded-full border border-line-strong bg-transparent px-3.5 font-mono text-sm font-medium text-ink tabular-nums focus-camel transition hover:border-line-hover hover:bg-surface-raised disabled:cursor-not-allowed disabled:opacity-40',
                )}
                disabled={!hasRecordings}
            >
                {speed}×
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
                <DropdownMenuRadioGroup
                    onValueChange={(v) =>
                        onSpeedChange(Number(v) as PlaybackSpeed)
                    }
                    value={String(speed)}
                >
                    {PLAYBACK_SPEEDS.map((s) => (
                        <DropdownMenuRadioItem key={s} value={String(s)}>
                            {s}×
                        </DropdownMenuRadioItem>
                    ))}
                </DropdownMenuRadioGroup>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
