import {
    Pause,
    Play,
    Repeat,
    ShuffleIcon,
    SkipBack,
    SkipForward,
} from 'lucide-react';

import { Button } from '~/components/ui/Button';
import { cn } from '~/lib/utilities';

import { RECORDER_TOGGLE_ON_CLASS } from './toggleStyles';

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
                'flex items-center justify-center gap-x-3 sm:gap-x-5',
            )}
        >
            <Button
                aria-label="Shuffle"
                aria-pressed={isShuffle}
                className={cn(
                    'app-recording__shuffle size-11 p-0 text-ink-muted hover:bg-surface-high hover:text-ink',
                    isShuffle && RECORDER_TOGGLE_ON_CLASS,
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
                className="app-recording__previous size-13 border border-line-strong p-0 text-ink hover:border-line-hover hover:bg-surface-raised"
                disabled={!hasRecordings || !canGoPrevious}
                onClick={onPrevious}
                type="button"
                variant="ghost"
            >
                <SkipBack aria-hidden className="size-4.5 fill-current" />
            </Button>

            <Button
                aria-label={isPlaying ? 'Pause' : 'Play'}
                className={cn(
                    'app-recording__play-pause size-19 bg-camel p-0 text-on-camel hover:bg-camel hover:text-on-camel active:scale-95 dark:hover:bg-camel',
                )}
                data-state={isPlaying ? 'playing' : 'paused'}
                disabled={!hasRecordings}
                onClick={onTogglePlayPause}
                type="button"
                variant="ghost"
            >
                {isPlaying ? (
                    <Pause
                        aria-hidden
                        className="size-7 fill-current"
                        strokeWidth={0}
                    />
                ) : (
                    <Play
                        aria-hidden
                        className="size-7 translate-x-0.5 fill-current"
                        strokeWidth={0}
                    />
                )}
            </Button>

            <Button
                aria-label="Next"
                className="app-recording__next size-13 border border-line-strong p-0 text-ink hover:border-line-hover hover:bg-surface-raised"
                disabled={!hasRecordings || !canGoNext}
                onClick={onNext}
                type="button"
                variant="ghost"
            >
                <SkipForward aria-hidden className="size-4.5 fill-current" />
            </Button>

            <Button
                aria-label="Repeat"
                aria-pressed={isRepeat}
                className={cn(
                    'app-recording__repeat size-11 p-0 text-ink-muted hover:bg-surface-high hover:text-ink',
                    isRepeat && RECORDER_TOGGLE_ON_CLASS,
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
