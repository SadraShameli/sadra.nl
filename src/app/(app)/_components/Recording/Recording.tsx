'use client';

import { Download } from 'lucide-react';

import { Button } from '~/components/ui/Button';
import { Card } from '~/components/ui/Card';
import { cn } from '~/lib/utilities';
import { api } from '~/trpc/react';

import { GetRecordingURL } from './helpers';
import { PlaybackControls } from './PlaybackControls';
import { ProgressBar } from './ProgressBar';
import { RecordingList } from './RecordingList';
import { useAudioPlayer } from './useAudioPlayer';
import { VolumeControls } from './VolumeControls';

export default function RecordingSection({
    decorVideoUrl,
}: {
    decorVideoUrl: string;
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

    return (
        <section className={cn('app-recording', 'pt-spacing-inner')}>
            <Card className="container">
                <div className="flex flex-col gap-6 lg:grid lg:grid-cols-2 lg:items-center">
                    <video
                        autoPlay
                        className={cn('app-recording__video')}
                        loop
                        muted
                        playsInline
                    >
                        <source src={decorVideoUrl} type="video/mp4" />
                    </video>

                    <div
                        className={cn(
                            'relative flex flex-col gap-6 rounded-2xl border border-white/10 bg-white/2 p-6',
                        )}
                    >
                        <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0 flex-1">
                                <p className="text-[10px] font-medium tracking-[0.2em] text-neutral-500 uppercase">
                                    Now Playing
                                </p>
                                <p className="mt-1.5 truncate text-base font-semibold text-neutral-50">
                                    {currentRecording?.file_name ?? '—'}
                                </p>
                            </div>
                            <Button
                                aria-label="Download recording"
                                className={cn(
                                    'app-recording__download',
                                    'size-9 shrink-0 rounded-full text-neutral-400 hover:bg-white/6 hover:text-white',
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
                                <Download className="size-4" />
                            </Button>
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

                        <div className="border-t border-white/6 pt-5">
                            <RecordingList
                                currentIdx={currentRecordingIdx}
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
                </div>
            </Card>
        </section>
    );
}
