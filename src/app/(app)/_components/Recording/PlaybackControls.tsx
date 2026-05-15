import { Repeat, ShuffleIcon, SkipBack, SkipForward } from 'lucide-react';

import PauseIcon from '~/components/ui/Icons/Pause';
import PlayIcon from '~/components/ui/Icons/Play';
import { cn } from '~/lib/utils';

interface PlaybackControlsProps {
    canGoNext: boolean;
    canGoPrevious: boolean;
    hasRecordings: boolean;
    isLoading: boolean;
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
    isLoading,
    isPlaying,
    isRepeat,
    isShuffle,
    onNext,
    onPrevious,
    onRepeat,
    onShuffle,
    onTogglePlayPause,
}: PlaybackControlsProps) {
    return (
        <div
            className={cn(
                'app-recording__playback-controls',
                'flex items-center justify-center gap-x-7',
            )}
        >
            <button
                aria-label="Shuffle"
                className={cn(
                    'app-recording__shuffle',
                    'size-6 text-neutral-400 transition hover:text-white disabled:text-neutral-700',
                    isShuffle && 'text-white',
                )}
                data-state={isShuffle ? 'on' : 'off'}
                disabled={!hasRecordings}
                onClick={onShuffle}
            >
                <ShuffleIcon />
            </button>

            <button
                aria-label="Previous"
                className={cn(
                    'app-recording__previous',
                    'text-neutral-400 hover:text-white disabled:text-neutral-700',
                )}
                disabled={!hasRecordings || !canGoPrevious}
                onClick={onPrevious}
            >
                <SkipBack className="size-6 transition" />
            </button>

            <button
                aria-label={isPlaying ? 'Pause' : 'Play'}
                className={cn(
                    'app-recording__play-pause',
                    'size-12 disabled:text-neutral-600',
                )}
                data-state={isPlaying ? 'playing' : 'paused'}
                disabled={!hasRecordings || isLoading}
                onClick={onTogglePlayPause}
            >
                {isLoading ? (
                    <div className="size-6 animate-spin rounded-full border-2 border-current border-t-transparent" />
                ) : isPlaying ? (
                    <PauseIcon />
                ) : (
                    <PlayIcon />
                )}
            </button>

            <button
                aria-label="Next"
                className={cn(
                    'app-recording__next',
                    'text-neutral-400 hover:text-white disabled:text-neutral-700',
                )}
                disabled={!hasRecordings || !canGoNext}
                onClick={onNext}
            >
                <SkipForward className="size-6 transition" />
            </button>

            <button
                aria-label="Repeat"
                className={cn(
                    'app-recording__repeat',
                    'size-6 text-neutral-400 transition hover:text-white disabled:text-neutral-700',
                    isRepeat && 'text-white',
                )}
                data-state={isRepeat ? 'on' : 'off'}
                disabled={!hasRecordings}
                onClick={onRepeat}
            >
                <Repeat />
            </button>
        </div>
    );
}
