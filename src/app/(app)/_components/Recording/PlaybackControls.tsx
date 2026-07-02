import { Repeat, ShuffleIcon, SkipBack, SkipForward } from 'lucide-react';

import { Button } from '~/components/ui/Button';
import PauseIcon from '~/components/ui/Icons/Pause';
import PlayIcon from '~/components/ui/Icons/Play';
import { cn } from '~/lib/utils';

interface PlaybackControlsProperties {
    canGoNext: boolean;
    canGoPrevious: boolean;
    hasRecordings: boolean;
    isPlaying: boolean;
    isRepeat: boolean;
    isShuffle: boolean;
    onNext: () => void;
    onPrevious: () => void;
    onRepeat: () => void;
    onShuffle: () => void;
    onTogglePlayPause: () => void;
}

export function PlaybackControls({
    canGoNext,
    canGoPrevious,
    hasRecordings,
    isPlaying,
    isRepeat,
    isShuffle,
    onNext,
    onPrevious,
    onRepeat,
    onShuffle,
    onTogglePlayPause,
}: PlaybackControlsProperties) {
    return (
        <div
            className={cn(
                'app-recording__playback-controls',
                'flex items-center justify-center gap-x-4 sm:gap-x-6',
            )}
        >
            <Button
                aria-label="Shuffle"
                className={cn(
                    'app-recording__shuffle size-9 rounded-full p-0 text-neutral-400 transition hover:bg-white/5 hover:text-foreground',
                    isShuffle && 'text-foreground',
                )}
                data-state={isShuffle ? 'on' : 'off'}
                disabled={!hasRecordings}
                onClick={onShuffle}
                type="button"
                variant="ghost"
            >
                <ShuffleIcon className="size-4" />
            </Button>

            <Button
                aria-label="Previous"
                className="app-recording__previous size-9 rounded-full p-0 text-neutral-300 transition hover:bg-white/5 hover:text-foreground"
                disabled={!hasRecordings || !canGoPrevious}
                onClick={onPrevious}
                type="button"
                variant="ghost"
            >
                <SkipBack className="size-5 fill-current" />
            </Button>

            <Button
                aria-label={isPlaying ? 'Pause' : 'Play'}
                className={cn(
                    'app-recording__play-pause size-12 rounded-full p-0 text-primary transition hover:scale-105 active:scale-95',
                )}
                data-state={isPlaying ? 'playing' : 'paused'}
                disabled={!hasRecordings}
                onClick={onTogglePlayPause}
                type="button"
                variant="ghost"
            >
                {isPlaying ? (
                    <PauseIcon className="size-10" />
                ) : (
                    <PlayIcon className="size-10" />
                )}
            </Button>

            <Button
                aria-label="Next"
                className="app-recording__next size-9 rounded-full p-0 text-neutral-300 transition hover:bg-white/5 hover:text-foreground"
                disabled={!hasRecordings || !canGoNext}
                onClick={onNext}
                type="button"
                variant="ghost"
            >
                <SkipForward className="size-5 fill-current" />
            </Button>

            <Button
                aria-label="Repeat"
                className={cn(
                    'app-recording__repeat size-9 rounded-full p-0 text-neutral-400 transition hover:bg-white/5 hover:text-foreground',
                    isRepeat && 'text-foreground',
                )}
                data-state={isRepeat ? 'on' : 'off'}
                disabled={!hasRecordings}
                onClick={onRepeat}
                type="button"
                variant="ghost"
            >
                <Repeat className="size-4" />
            </Button>
        </div>
    );
}
