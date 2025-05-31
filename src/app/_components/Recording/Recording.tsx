'use client';

import {
    ArrowRight,
    Download,
    ListEnd,
    Music2,
    Repeat,
    ShuffleIcon,
    SkipBack,
    SkipForward,
    Volume,
    Volume1,
    Volume2,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { cn } from '~/lib/utils';
import { api } from '~/trpc/react';

import { Button } from '~/components/ui/Button';
import { Card } from '~/components/ui/Card';
import PauseIcon from '~/components/ui/Icons/Pause';
import PlayIcon from '~/components/ui/Icons/Play';
import { ScrollArea } from '~/components/ui/ScrollArea';
import { Slider } from '~/components/ui/Slider';

import { ConvertSecondsToString, GetRandom, GetRecordingURL } from './helpers';

export default function RecordingSection({}) {
    const recordings = api.recording.getRecordingsNoFile.useQuery();

    const router = useRouter();
    const audio = useRef<HTMLAudioElement>(null);
    const [time, setTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [volume, setVolume] = useState(1);
    const [prevVolume, setPrevVolume] = useState(volume);
    const [isPlaying, setIsPlaying] = useState(false);
    const [isRepeat, setIsRepeat] = useState(false);
    const [isShuffle, setIsShuffle] = useState(false);
    const [isAutoPlay, setIsAutoPlay] = useState(false);
    const [currentRecordingIdx, setCurrentRecordingIdx] = useState(0);
    const [isLoading, setIsLoading] = useState(false);

    const safeCurrentIdx = Math.max(
        0,
        Math.min(currentRecordingIdx, (recordings.data?.length ?? 1) - 1),
    );

    const PlayAudio = useCallback(async () => {
        if (!audio.current) return;

        try {
            setIsLoading(true);
            await audio.current.play();
            setIsPlaying(true);
        } catch (error) {
            console.error('Failed to play audio:', error);
            setIsPlaying(false);
        } finally {
            setIsLoading(false);
        }
    }, []);

    const PauseAudio = useCallback(() => {
        if (!audio.current) return;

        audio.current.pause();
        setIsPlaying(false);
    }, []);

    const OnAudioPause = useCallback(() => {
        if (!recordings.data?.length || isLoading) return;

        if (!isPlaying) {
            void PlayAudio();
        } else {
            PauseAudio();
        }
    }, [isPlaying, recordings.data?.length, isLoading, PlayAudio, PauseAudio]);

    useEffect(() => {
        if (!recordings.data?.length || !audio.current) return;

        const recording = recordings.data[safeCurrentIdx];
        if (recording) {
            const newSrc = GetRecordingURL(recording);
            if (audio.current.src !== newSrc) {
                audio.current.src = newSrc;
                audio.current.load();
                setTime(0);
                setDuration(0);
            }
        }
    }, [safeCurrentIdx, recordings.data]);

    useEffect(() => {
        if (audio.current) {
            audio.current.volume = volume;
        }
    }, [volume]);

    useEffect(() => {
        if (currentRecordingIdx !== safeCurrentIdx) {
            setCurrentRecordingIdx(safeCurrentIdx);
        }
    }, [safeCurrentIdx, currentRecordingIdx]);

    useEffect(() => {
        const audioElement = audio.current;
        return () => {
            if (audioElement) {
                audioElement.pause();
                audioElement.src = '';
            }
        };
    }, []);

    const handlePrevious = useCallback(() => {
        if (!recordings.data?.length) return;

        setCurrentRecordingIdx((prev) => {
            const newIdx = prev - 1;
            return newIdx < 0 ? 0 : newIdx;
        });
    }, [recordings.data?.length]);

    const handleNext = useCallback(() => {
        if (!recordings.data?.length) return;

        setCurrentRecordingIdx((prev) => {
            const newIdx = prev + 1;
            return newIdx >= recordings.data.length
                ? recordings.data.length - 1
                : newIdx;
        });
    }, [recordings.data?.length]);

    const handleShuffle = useCallback(() => {
        if (!recordings.data?.length) return;

        if (isRepeat) setIsRepeat(false);
        if (isAutoPlay) setIsAutoPlay(false);

        setIsShuffle((prev) => {
            if (!prev && recordings.data.length > 1) {
                let newIdx;
                do {
                    newIdx = GetRandom(0, recordings.data.length - 1);
                } while (
                    newIdx === safeCurrentIdx &&
                    recordings.data.length > 1
                );
                setCurrentRecordingIdx(newIdx);
            }
            return !prev;
        });
    }, [recordings.data?.length, safeCurrentIdx, isRepeat, isAutoPlay]);

    const handleRecordingSelect = useCallback(
        (recording: NonNullable<typeof recordings.data>[0]) => {
            if (!recordings.data || !audio.current) return;

            const newIdx = recordings.data.indexOf(recording);
            if (newIdx !== -1) {
                setCurrentRecordingIdx(newIdx);
                if (isShuffle) setIsShuffle(false);
            }
        },
        [recordings, isShuffle],
    );

    const handleAudioEnded = useCallback(() => {
        if (!recordings.data?.length) return;

        setCurrentRecordingIdx((prev) => {
            if (isShuffle && recordings.data.length > 1) {
                let newIdx;
                do {
                    newIdx = GetRandom(0, recordings.data.length - 1);
                } while (newIdx === prev && recordings.data.length > 1);
                return newIdx;
            }

            if (isAutoPlay && prev < recordings.data.length - 1) {
                return prev + 1;
            }

            if (!isRepeat) {
                setIsPlaying(false);
            }
            return prev;
        });
    }, [recordings.data?.length, isShuffle, isAutoPlay, isRepeat]);

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
                                    const recording =
                                        recordings.data?.[safeCurrentIdx];
                                    if (recording) {
                                        router.push(GetRecordingURL(recording));
                                    }
                                }}
                                disabled={!recordings.data?.length}
                            >
                                <Download className="mr-2 size-5" />
                                Download
                            </Button>
                        </div>

                        <div className="my-5 grid h-[27vh] lg:h-[25vh]">
                            <ScrollArea>
                                {recordings.data?.length
                                    ? recordings.data.map((recording) => (
                                          <button
                                              className="hover:bg-accent flex rounded-lg p-3 font-semibold transition lg:w-11/12"
                                              onClick={() =>
                                                  handleRecordingSelect(
                                                      recording,
                                                  )
                                              }
                                              key={recording.id}
                                          >
                                              <div className="flex items-center gap-x-2 text-sm">
                                                  {recordings.data?.indexOf(
                                                      recording,
                                                  ) === safeCurrentIdx ? (
                                                      <ArrowRight className="size-5" />
                                                  ) : (
                                                      <Music2 className="size-5" />
                                                  )}
                                                  {recording.file_name}
                                              </div>
                                          </button>
                                      ))
                                    : [...Array<number>(5)].map((_, index) => (
                                          <div
                                              className="shimmer lg:w-1-3 my-2 h-5"
                                              key={index}
                                          />
                                      ))}
                            </ScrollArea>
                        </div>

                        <div className="mx-auto mb-3 max-w-xl grid-flow-row gap-5 xl:grid xl:grid-cols-2">
                            <div className="flex items-center justify-center gap-x-7">
                                <button
                                    className={cn(
                                        `size-6 text-neutral-400 transition hover:text-white disabled:text-neutral-700`,
                                        isShuffle && 'text-white',
                                    )}
                                    onClick={handleShuffle}
                                    disabled={!recordings.data?.length}
                                    aria-label="Shuffle"
                                >
                                    <ShuffleIcon />
                                </button>

                                <button
                                    className="text-neutral-400 hover:text-white disabled:text-neutral-700"
                                    onClick={handlePrevious}
                                    disabled={
                                        !recordings.data?.length ||
                                        safeCurrentIdx === 0
                                    }
                                    aria-label="Previous"
                                >
                                    <SkipBack className="size-6 transition" />
                                </button>

                                <button
                                    aria-label="Pause"
                                    className="size-12 disabled:text-neutral-600"
                                    onClick={OnAudioPause}
                                    disabled={
                                        !recordings.data?.length || isLoading
                                    }
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
                                    onClick={handleNext}
                                    disabled={
                                        !recordings.data?.length ||
                                        safeCurrentIdx >=
                                            (recordings.data?.length ?? 0) - 1
                                    }
                                    aria-label="Next"
                                >
                                    <SkipForward className="size-6 transition" />
                                </button>

                                <button
                                    className={cn(
                                        'size-6 text-neutral-400 transition hover:text-white disabled:text-neutral-700',
                                        isRepeat && 'text-white',
                                    )}
                                    onClick={() => {
                                        if (isShuffle) setIsShuffle(false);
                                        if (isAutoPlay) setIsAutoPlay(false);
                                        setIsRepeat((prev) => !prev);
                                    }}
                                    disabled={!recordings.data?.length}
                                    aria-label="Repeat"
                                >
                                    <Repeat />
                                </button>
                            </div>

                            <div className="mt-5 flex items-center justify-center gap-x-3 text-neutral-400 xl:mt-0 xl:justify-end">
                                <button
                                    className={cn(
                                        'size-6 transition hover:text-white disabled:text-neutral-700',
                                        isAutoPlay && 'text-white',
                                    )}
                                    onClick={() => {
                                        if (isShuffle) setIsShuffle(false);
                                        if (isRepeat) setIsRepeat(false);
                                        setIsAutoPlay((prev) => !prev);
                                    }}
                                    disabled={!recordings.data?.length}
                                    aria-label="Auto Play"
                                >
                                    <ListEnd />
                                </button>

                                <button
                                    className="size-6 transition hover:text-white disabled:text-neutral-700"
                                    onClick={() => {
                                        if (volume === 0) {
                                            setVolume(prevVolume);
                                        } else {
                                            setPrevVolume(volume);
                                            setVolume(0);
                                        }
                                    }}
                                    disabled={!recordings.data?.length}
                                    aria-label="Volume"
                                >
                                    {volume === 0 ? (
                                        <Volume className="text-white" />
                                    ) : volume >= 0.6 ? (
                                        <Volume2 />
                                    ) : (
                                        <Volume1 />
                                    )}
                                </button>

                                <Slider
                                    className="h-2 w-2/5"
                                    defaultValue={[1]}
                                    value={[volume]}
                                    min={0}
                                    max={1}
                                    step={0.01}
                                    onValueChange={(values: number[]) => {
                                        if (values[0] !== undefined) {
                                            setVolume(values[0]);
                                        }
                                    }}
                                    disabled={!recordings.data?.length}
                                />
                            </div>

                            <div className="col-span-2 mt-5 grid grid-cols-6 items-center gap-x-3 leading-none font-semibold">
                                <span className="col-span-1 text-right text-sm">
                                    {ConvertSecondsToString(time)}
                                </span>

                                <Slider
                                    className="col-span-4 h-1/3"
                                    defaultValue={[0]}
                                    min={0}
                                    max={duration + 0.01}
                                    value={[time]}
                                    onValueChange={(values: number[]) => {
                                        if (
                                            audio.current &&
                                            values[0] !== undefined
                                        ) {
                                            audio.current.currentTime =
                                                values[0];
                                            setTime(values[0]);
                                        }
                                    }}
                                    disabled={!recordings.data?.length}
                                />

                                <span className="col-span-1 text-sm">
                                    {ConvertSecondsToString(duration)}
                                </span>
                            </div>
                        </div>

                        {recordings.data?.length ? (
                            <audio
                                preload="metadata"
                                ref={audio}
                                loop={isRepeat}
                                onEnded={handleAudioEnded}
                                onTimeUpdate={(e) => {
                                    setTime(e.currentTarget.currentTime);
                                }}
                                onLoadedMetadata={(e) => {
                                    setDuration(e.currentTarget.duration);
                                }}
                                onCanPlay={() => {
                                    if (isPlaying && audio.current?.paused) {
                                        void PlayAudio();
                                    }
                                }}
                                onError={(e) => {
                                    console.error('Audio error:', e);
                                    setIsPlaying(false);
                                    setIsLoading(false);
                                }}
                            >
                                <source
                                    type="audio/wav"
                                    src={
                                        recordings.data[safeCurrentIdx]
                                            ? GetRecordingURL(
                                                  recordings.data[
                                                      safeCurrentIdx
                                                  ],
                                              )
                                            : ''
                                    }
                                />
                            </audio>
                        ) : null}
                    </div>
                </div>
            </Card>
        </div>
    );
}
