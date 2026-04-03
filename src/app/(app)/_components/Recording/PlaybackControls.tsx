import { Repeat, ShuffleIcon, SkipBack, SkipForward } from 'lucide-react';
import PauseIcon from '~/components/ui/Icons/Pause';
import PlayIcon from '~/components/ui/Icons/Play';
import { cn } from '~/lib/utils';

interface PlaybackControlsProps {
    isPlaying: boolean;
    isLoading: boolean;
    isShuffle: boolean;
    isRepeat: boolean;
    canGoPrevious: boolean;
    canGoNext: boolean;
    hasRecordings: boolean;
    onTogglePlayPause: () => void;
    onPrevious: () => void;
    onNext: () => void;
    onShuffle: () => void;
    onRepeat: () => void;
}

export function PlaybackControls({
    isPlaying,
    isLoading,
    isShuffle,
    isRepeat,
    canGoPrevious,
    canGoNext,
    hasRecordings,
    onTogglePlayPause,
    onPrevious,
    onNext,
    onShuffle,
    onRepeat,
}: PlaybackControlsProps) {
    return (
        <div className="flex items-center justify-center gap-x-7">
            <button
                className={cn(
                    'size-6 text-neutral-400 transition hover:text-white disabled:text-neutral-700',
                    isShuffle && 'text-white',
                )}
                onClick={onShuffle}
                disabled={!hasRecordings}
                aria-label="Shuffle"
            >
                <ShuffleIcon />
            </button>

            <button
                className="text-neutral-400 hover:text-white disabled:text-neutral-700"
                onClick={onPrevious}
                disabled={!hasRecordings || !canGoPrevious}
                aria-label="Previous"
            >
                <SkipBack className="size-6 transition" />
            </button>

            <button
                aria-label="Pause"
                className="size-12 disabled:text-neutral-600"
                onClick={onTogglePlayPause}
                disabled={!hasRecordings || isLoading}
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
                className="text-neutral-400 hover:text-white disabled:text-neutral-700"
                onClick={onNext}
                disabled={!hasRecordings || !canGoNext}
                aria-label="Next"
            >
                <SkipForward className="size-6 transition" />
            </button>

            <button
                className={cn(
                    'size-6 text-neutral-400 transition hover:text-white disabled:text-neutral-700',
                    isRepeat && 'text-white',
                )}
                onClick={onRepeat}
                disabled={!hasRecordings}
                aria-label="Repeat"
            >
                <Repeat />
            </button>
        </div>
    );
}
