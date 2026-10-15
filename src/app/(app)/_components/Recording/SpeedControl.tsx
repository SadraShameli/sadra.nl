import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuRadioGroup,
    DropdownMenuRadioItem,
    DropdownMenuTrigger,
} from '~/components/ui/DropDown';
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
                    'inline-flex h-8 items-center justify-center rounded-full border border-border bg-foreground/4 px-3 text-xs font-semibold text-foreground/80 tabular-nums transition hover:bg-foreground/8 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40',
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
