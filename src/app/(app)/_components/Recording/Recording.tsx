'use client';

import { Download } from 'lucide-react';

import { Chip } from '~/app/(app)/_components/home/Chip';
import { AutoplayVideo } from '~/components/AutoplayVideo';
import { Button } from '~/components/ui/button';
import { Skeleton } from '~/components/ui/skeleton';
import { type LoopingVideo } from '~/lib/site/content';
import { DecorativeSeries } from '~/lib/site/DecorativeSeries';
import { cn } from '~/lib/utilities';
import { api } from '~/trpc/react';

import { GetRecordingURL } from './helpers';
import { PlaybackControls } from './PlaybackControls';
import { ProgressBar } from './ProgressBar';
import { RecordingList } from './RecordingList';
import { useAudioPlayer } from './useAudioPlayer';
import { VolumeControls } from './VolumeControls';

const WAVEFORM = new DecorativeSeries(3).waveform(72);

export default function RecordingSection({
    decorChip,
    decorVideo,
}: {
    readonly decorChip: string;
    readonly decorVideo: LoopingVideo;
}) {
    const recordings = api.recording.getRecordingsNoFile.useQuery();

    const {
        audioRef,
        currentRecording,
        currentRecordingIdx,
        duration,
        handleAudioEnded,
        handleAutoPlay,
        handleNext,
        handlePrevious,
        handleRecordingSelect,
        handleRepeat,
        handleShuffle,
        handleSpeedChange,
        handleTimeChange,
        handleVolumeChange,
        isAutoPlay,
        isPlaying,
        isRepeat,
        isShuffle,
        playAudio,
        playbackRate,
        setDuration,
        setTime,
        time,
        toggleMute,
        togglePlayPause,
        volume,
    } = useAudioPlayer({ recordings: recordings.data });

    const hasRecordings = Boolean(recordings.data?.length);
    const canGoPrevious = currentRecordingIdx > 0;
    const canGoNext = currentRecordingIdx < (recordings.data?.length ?? 0) - 1;

    const progress = duration > 0 ? time / duration : 0;

    return (
        <div
            className={cn(
                'app-recording',
                'flex flex-wrap items-stretch gap-4',
            )}
        >
            <div className="flex min-w-0 flex-[999_1_560px] flex-col gap-5 rounded-xl border border-line bg-surface p-6 sm:p-7">
                <div className="flex items-start justify-between gap-4">
                    <div className="flex min-w-0 flex-1 flex-col gap-2.5">
                        <p className="m-0 type-micro text-camel">Now playing</p>
                        {recordings.isPending ? (
                            <Skeleton className="h-9 w-64 max-w-full" />
                        ) : (
                            <p className="m-0 animate-in truncate font-serif text-4xl leading-none font-medium tracking-[-0.02em] text-ink duration-300 fade-in">
                                {currentRecording?.file_name ??
                                    'No recordings yet'}
                            </p>
                        )}
                    </div>
                    <Button
                        aria-label="Download recording"
                        className={cn(
                            'app-recording__download',
                            'size-11 shrink-0 border border-line-strong text-ink hover:border-line-hover hover:bg-surface-raised',
                        )}
                        disabled={!hasRecordings}
                        onClick={() => {
                            if (currentRecording) {
                                window.location.assign(
                                    GetRecordingURL(currentRecording),
                                );
                            }
                        }}
                        size="icon"
                        variant="ghost"
                    >
                        <Download
                            aria-hidden
                            className="size-4.5"
                            strokeWidth={1.6}
                        />
                    </Button>
                </div>

                <div aria-hidden className="flex h-16 items-center gap-0.5">
                    {WAVEFORM.map((height, index) => (
                        <span
                            className={cn(
                                'flex-1 rounded-[2px] transition-colors',
                                index / WAVEFORM.length < progress
                                    ? 'bg-camel'
                                    : 'bg-line-strong',
                            )}
                            key={index}
                            style={{ height: `${String(height)}%` }}
                        />
                    ))}
                </div>

                <ProgressBar
                    duration={duration}
                    hasRecordings={hasRecordings}
                    onTimeChange={handleTimeChange}
                    time={time}
                />

                <PlaybackControls
                    canGoNext={canGoNext}
                    canGoPrevious={canGoPrevious}
                    hasRecordings={hasRecordings}
                    isPlaying={isPlaying}
                    isRepeat={isRepeat}
                    isShuffle={isShuffle}
                    onNext={handleNext}
                    onPrevious={handlePrevious}
                    onRepeat={handleRepeat}
                    onShuffle={handleShuffle}
                    onTogglePlayPause={togglePlayPause}
                />

                <VolumeControls
                    hasRecordings={hasRecordings}
                    isAutoPlay={isAutoPlay}
                    onAutoPlay={handleAutoPlay}
                    onMute={toggleMute}
                    onSpeedChange={handleSpeedChange}
                    onVolumeChange={handleVolumeChange}
                    playbackRate={playbackRate}
                    volume={volume}
                />

                <div className="border-t border-line pt-5">
                    <RecordingList
                        currentIdx={currentRecordingIdx}
                        isLoading={recordings.isPending}
                        isPlaying={isPlaying}
                        onSelect={handleRecordingSelect}
                        recordings={recordings.data}
                    />
                </div>

                {hasRecordings && (
                    <audio
                        aria-label="Recording playback"
                        className={'app-recording__audio'}
                        loop={isRepeat}
                        onCanPlay={() => {
                            if (isPlaying && audioRef.current?.paused) {
                                void playAudio();
                            }
                        }}
                        onEnded={handleAudioEnded}
                        onError={(event) => {
                            console.error('Audio error:', event);
                        }}
                        onLoadedMetadata={(event) => {
                            setDuration(event.currentTarget.duration);
                        }}
                        onTimeUpdate={(event) => {
                            setTime(event.currentTarget.currentTime);
                        }}
                        preload="none"
                        ref={audioRef}
                    >
                        <track kind="captions" />
                    </audio>
                )}
            </div>

            <div className="relative aspect-4/3 min-w-0 flex-[1_1_340px] overflow-hidden rounded-xl border border-line bg-media-black lg:aspect-auto">
                <AutoplayVideo
                    className={cn(
                        'app-recording__video',
                        'absolute inset-0 size-full object-cover',
                    )}
                    video={decorVideo}
                />
                <Chip className="absolute bottom-5 left-5">{decorChip}</Chip>
            </div>
        </div>
    );
}
