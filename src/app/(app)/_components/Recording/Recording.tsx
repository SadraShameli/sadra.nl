'use client';

import { Download } from 'lucide-react';

import { Button } from '~/components/ui/Button';
import { Card } from '~/components/ui/Card';
import { cn } from '~/lib/utils';
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
        isLoading,
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
                        className={cn('app-recording__video', 'rounded-lg')}
                        loop
                        muted
                        playsInline
                    >
                        <source src={decorVideoUrl} type="video/mp4" />
                    </video>

                    <div className="flex flex-col gap-5 rounded-xl bg-muted p-6">
                        <div className="flex items-center justify-between">
                            <span className="font-bold text-neutral-100">
                                Recordings
                            </span>
                            <Button
                                className={cn(
                                    'app-recording__download',
                                    'h-8 gap-1.5 text-xs',
                                )}
                                disabled={!hasRecordings}
                                onClick={() => {
                                    if (currentRecording) {
                                        window.location.href =
                                            GetRecordingURL(currentRecording);
                                    }
                                }}
                                size="sm"
                                variant="outline"
                            >
                                <Download className="size-3.5" />
                                Download
                            </Button>
                        </div>

                        <RecordingList
                            currentIdx={currentRecordingIdx}
                            onSelect={handleRecordingSelect}
                            recordings={recordings.data}
                        />

                        <div className="space-y-3 border-t border-white/10 pt-4">
                            <PlaybackControls
                                canGoNext={canGoNext}
                                canGoPrevious={canGoPrevious}
                                hasRecordings={hasRecordings}
                                isLoading={isLoading}
                                isPlaying={isPlaying}
                                isRepeat={isRepeat}
                                isShuffle={isShuffle}
                                onNext={handleNext}
                                onPrevious={handlePrevious}
                                onRepeat={handleRepeat}
                                onShuffle={handleShuffle}
                                onTogglePlayPause={togglePlayPause}
                            />

                            <ProgressBar
                                duration={duration}
                                hasRecordings={hasRecordings}
                                onTimeChange={handleTimeChange}
                                time={time}
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
                                onError={(e) => {
                                    console.error('Audio error:', e);
                                }}
                                onLoadedMetadata={(e) => {
                                    setDuration(e.currentTarget.duration);
                                }}
                                onTimeUpdate={(e) => {
                                    setTime(e.currentTarget.currentTime);
                                }}
                                preload="metadata"
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
