'use client';

import { Download } from 'lucide-react';
import { api } from '~/trpc/react';

import { Button } from '~/components/ui/Button';
import { Card } from '~/components/ui/Card';

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
        durations,
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
        <div className="pt-spacing-inner">
            <Card className="container">
                <div className="flex flex-col gap-6 lg:grid lg:grid-cols-2 lg:items-center">
                    <video
                        loop
                        autoPlay
                        muted
                        playsInline
                        className="rounded-lg"
                    >
                        <source src={decorVideoUrl} type="video/mp4" />
                    </video>

                    <div className="bg-muted flex flex-col gap-5 rounded-xl p-6">
                        <div className="flex items-center justify-between">
                            <span className="text-sm font-semibold tracking-widest text-neutral-100 uppercase">
                                Recordings
                            </span>
                            <Button
                                className="h-8 gap-1.5 text-xs"
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                    if (currentRecording) {
                                        window.location.href =
                                            GetRecordingURL(currentRecording);
                                    }
                                }}
                                disabled={!hasRecordings}
                            >
                                <Download className="size-3.5" />
                                Download
                            </Button>
                        </div>

                        <RecordingList
                            recordings={recordings.data}
                            currentIdx={currentRecordingIdx}
                            durations={durations}
                            onSelect={handleRecordingSelect}
                        />

                        <div className="space-y-3 border-t border-white/10 pt-4">
                            <PlaybackControls
                                isPlaying={isPlaying}
                                isLoading={isLoading}
                                isShuffle={isShuffle}
                                isRepeat={isRepeat}
                                canGoPrevious={canGoPrevious}
                                canGoNext={canGoNext}
                                hasRecordings={hasRecordings}
                                onTogglePlayPause={togglePlayPause}
                                onPrevious={handlePrevious}
                                onNext={handleNext}
                                onShuffle={handleShuffle}
                                onRepeat={handleRepeat}
                            />

                            <ProgressBar
                                time={time}
                                duration={duration}
                                hasRecordings={hasRecordings}
                                onTimeChange={handleTimeChange}
                            />

                            <VolumeControls
                                volume={volume}
                                isAutoPlay={isAutoPlay}
                                hasRecordings={hasRecordings}
                                playbackRate={playbackRate}
                                onMute={toggleMute}
                                onVolumeChange={handleVolumeChange}
                                onAutoPlay={handleAutoPlay}
                                onSpeedChange={handleSpeedChange}
                            />
                        </div>

                        {hasRecordings && (
                            <audio
                                preload="metadata"
                                ref={audioRef}
                                loop={isRepeat}
                                onEnded={handleAudioEnded}
                                onTimeUpdate={(e) => {
                                    setTime(e.currentTarget.currentTime);
                                }}
                                onLoadedMetadata={(e) => {
                                    setDuration(e.currentTarget.duration);
                                }}
                                onCanPlay={() => {
                                    if (isPlaying && audioRef.current?.paused) {
                                        void playAudio();
                                    }
                                }}
                                onError={(e) => {
                                    console.error('Audio error:', e);
                                }}
                            />
                        )}
                    </div>
                </div>
            </Card>
        </div>
    );
}
