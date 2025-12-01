'use client';

import { Download } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { api } from '~/trpc/react';

import { Button } from '~/components/ui/Button';
import { Card } from '~/components/ui/Card';

import { GetRecordingURL } from './helpers';
import { PlaybackControls } from './PlaybackControls';
import { ProgressBar } from './ProgressBar';
import { RecordingList } from './RecordingList';
import { useAudioPlayer } from './useAudioPlayer';
import { VolumeControls } from './VolumeControls';

export default function RecordingSection({}) {
    const recordings = api.recording.getRecordingsNoFile.useQuery();
    const router = useRouter();

    const {
        audioRef,
        time,
        duration,
        volume,
        isPlaying,
        isRepeat,
        isShuffle,
        isAutoPlay,
        isLoading,
        currentRecordingIdx,
        currentRecording,
        audioSrc,
        togglePlayPause,
        handlePrevious,
        handleNext,
        handleShuffle,
        handleRepeat,
        handleAutoPlay,
        handleRecordingSelect,
        toggleMute,
        handleVolumeChange,
        handleTimeChange,
        playAudio,
        handleAudioEnded,
        setTime,
        setDuration,
    } = useAudioPlayer({ recordings: recordings.data });

    const hasRecordings = Boolean(recordings.data?.length);
    const canGoPrevious = currentRecordingIdx > 0;
    const canGoNext = currentRecordingIdx < (recordings.data?.length ?? 0) - 1;

    return (
        <div className="pt-spacing-inner">
            <Card className="container">
                <div className="grid-cols-2 items-center lg:grid">
                    <video loop autoPlay muted playsInline>
                        <source src="/headphone.mp4" type="video/mp4" />
                    </video>

                    <div className="bg-muted mb-spacing-inner w-full rounded-xl p-5 lg:my-0">
                        <div className="flex items-center justify-between lg:mx-3">
                            <p className="font-semibold">Recordings</p>

                            <Button
                                className="bg-transparent font-semibold"
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                    if (currentRecording) {
                                        router.push(
                                            GetRecordingURL(currentRecording),
                                        );
                                    }
                                }}
                                disabled={!hasRecordings}
                            >
                                <Download className="mr-2 size-5" />
                                Download
                            </Button>
                        </div>

                        <RecordingList
                            recordings={recordings.data}
                            currentIdx={currentRecordingIdx}
                            onSelect={handleRecordingSelect}
                        />

                        <div className="mx-auto mb-3 max-w-xl grid-flow-row gap-5 xl:grid xl:grid-cols-2">
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

                            <VolumeControls
                                volume={volume}
                                isAutoPlay={isAutoPlay}
                                hasRecordings={hasRecordings}
                                onMute={toggleMute}
                                onVolumeChange={handleVolumeChange}
                                onAutoPlay={handleAutoPlay}
                            />

                            <ProgressBar
                                time={time}
                                duration={duration}
                                hasRecordings={hasRecordings}
                                onTimeChange={handleTimeChange}
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
                            >
                                <source type="audio/wav" src={audioSrc} />
                            </audio>
                        )}
                    </div>
                </div>
            </Card>
        </div>
    );
}
