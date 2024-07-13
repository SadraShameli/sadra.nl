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

import RevealAnimation from '~/components/ui/Animations/Reveal';
import StaggerAnimation from '~/components/ui/Animations/Stagger';
import { Button } from '~/components/ui/Button';
import Card from '~/components/ui/Card';
import PauseIcon from '~/components/ui/Icons/Pause';
import PlayIcon from '~/components/ui/Icons/Play';
import { ScrollArea } from '~/components/ui/ScrollArea';
import { Slider } from '~/components/ui/Slider';

import { ConvertSecondsToString, GetRandom, GetRecordingURL } from './helpers';
import { api } from '~/trpc/react';

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
  const [prevRecording, setPrevRecording] = useState(currentRecordingIdx);

  const PlayAudio = useCallback(() => {
    void audio.current?.play();
    setIsPlaying(true);
  }, []);

  const OnAudioPlause = useCallback(() => {
    if (!isPlaying) {
      void audio.current?.play();
      setIsPlaying(true);
    } else if (audio.current?.readyState == 4) {
      if (isPlaying) {
        audio.current?.pause();
        setIsPlaying(false);
      } else {
        PlayAudio();
      }
    }
  }, [PlayAudio, isPlaying]);

  useEffect(() => {
    if (recordings.data && currentRecordingIdx < recordings.data.length) {
      if (prevRecording != currentRecordingIdx) {
        audio.current?.load();
        setPrevRecording(currentRecordingIdx);
      }
      if (isPlaying) {
        PlayAudio();
      }
    }
  }, [PlayAudio, currentRecordingIdx, isPlaying, prevRecording, recordings]);

  useEffect(() => {
    if (audio.current) {
      audio.current.volume = volume;
    }
  }, [volume]);

  return (
    <RevealAnimation>
      <Card>
        <StaggerAnimation className="grid-cols-2 items-center lg:grid">
          <video loop autoPlay muted playsInline>
            <source src="/headphone.mp4" type="video/mp4" />
          </video>

          <div>
            <div className="w-full rounded-xl bg-muted p-5">
              <div className="mx-3 flex items-center justify-between">
                <p className="font-semibold">Recordings</p>
                <Button
                  className="font-semibold"
                  size="sm"
                  onClick={() => {
                    if (recordings.data) {
                      const recording = recordings.data[currentRecordingIdx];
                      if (recording) {
                        router.push(GetRecordingURL(recording));
                      }
                    }
                  }}
                  disabled={!recordings.data?.length}
                >
                  <Download className="mr-2 size-5" />
                  Download
                </Button>
              </div>
              <div className="my-5 h-[27vh] md:h-[29vh]">
                <ScrollArea className="h-full">
                  {!recordings.data?.length
                    ? [...Array(9)].map(() => (
                        <div className="shimmer my-2 h-5 sm:w-11/12" />
                      ))
                    : recordings.data.map((recording) => (
                        <button
                          className="flex rounded-lg p-3 font-semibold transition hover:bg-accent sm:w-11/12"
                          onClick={() => {
                            if (audio.current) {
                              audio.current.src = GetRecordingURL(recording);
                              audio.current?.load();
                              void audio.current.play();
                              setIsPlaying(true);
                              setCurrentRecordingIdx(
                                recordings.data.indexOf(recording),
                              );
                            }
                          }}
                          key={recording.id}
                        >
                          <div className="flex items-center gap-x-2 text-sm">
                            {recordings.data.indexOf(recording) ==
                            currentRecordingIdx ? (
                              <ArrowRight className="size-5" />
                            ) : (
                              <Music2 className="size-5" />
                            )}
                            {recording.file_name}
                          </div>
                        </button>
                      ))}
                </ScrollArea>
              </div>

              <div className="mb-3 grid-flow-row gap-5 xl:grid xl:grid-cols-2 max-w-xl mx-auto">
                <div className="flex items-center justify-center gap-x-7">
                  <button
                    aria-label="Shuffle"
                    className={`size-6 text-neutral-400 transition hover:text-white disabled:text-neutral-700 ${isShuffle && 'text-white'}`}
                    onClick={() => {
                      if (recordings.data) {
                        if (isRepeat) setIsRepeat((prev) => !prev);
                        setIsShuffle((prev) => !prev);
                      }
                    }}
                    disabled={!recordings.data?.length}
                  >
                    <ShuffleIcon />
                  </button>

                  <button
                    aria-label="Previous"
                    className="text-neutral-400 hover:text-white disabled:text-neutral-700"
                    onClick={() => {
                      setCurrentRecordingIdx((prev) => prev - 1);
                    }}
                    disabled={currentRecordingIdx == 0}
                  >
                    <SkipBack className="size-6 transition" />
                  </button>

                  <button
                    aria-label="Plause"
                    className="size-12 disabled:text-neutral-600"
                    onClick={OnAudioPlause}
                    disabled={!recordings.data?.length}
                  >
                    {isPlaying ? <PauseIcon /> : <PlayIcon />}
                  </button>

                  <button
                    aria-label="Next"
                    className="text-neutral-400 hover:text-white disabled:text-neutral-700"
                    onClick={() => {
                      if (
                        recordings.data &&
                        currentRecordingIdx < recordings.data.length - 1
                      ) {
                        setCurrentRecordingIdx((prev) => prev + 1);
                        if (isRepeat || isShuffle) {
                          setIsRepeat(false);
                          setIsShuffle(false);
                          setIsAutoPlay(true);
                        }
                      }
                    }}
                    disabled={
                      !recordings.data?.length ||
                      currentRecordingIdx === recordings.data.length - 1
                    }
                  >
                    <SkipForward className="size-6 transition" />
                  </button>

                  <button
                    aria-label="Repeat"
                    className={`size-6 text-neutral-400 transition hover:text-white disabled:text-neutral-700 ${isRepeat && 'text-white'}`}
                    onClick={() => {
                      if (isShuffle) {
                        setIsShuffle((prev) => !prev);
                      }
                      if (isAutoPlay) {
                        setIsAutoPlay((prev) => !prev);
                      }
                      setIsRepeat((prev) => !prev);
                    }}
                    disabled={!recordings.data?.length}
                  >
                    <Repeat />
                  </button>
                </div>

                <div className="mt-5 flex items-center justify-center gap-x-3 text-neutral-400 xl:mt-0 xl:justify-end">
                  <button
                    aria-label="Auto Play"
                    className={`size-6 transition hover:text-white disabled:text-neutral-700 ${isAutoPlay && 'text-white'}`}
                    onClick={() => {
                      if (isShuffle) {
                        setIsShuffle((prev) => !prev);
                      }
                      if (isRepeat) {
                        setIsRepeat((prev) => !prev);
                      }
                      setIsAutoPlay((prev) => !prev);
                    }}
                    disabled={!recordings.data?.length}
                  >
                    <ListEnd />
                  </button>

                  <button
                    aria-label="Volume"
                    className="size-6 transition hover:text-white"
                    onClick={() => {
                      if (volume == 0) {
                        setVolume(prevVolume);
                      } else {
                        setPrevVolume(volume);
                        setVolume(0);
                      }
                    }}
                  >
                    {volume == 0 ? (
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
                      if (values[0] != undefined) {
                        setVolume(values[0]);
                      }
                    }}
                  />
                </div>

                <div className="col-span-2 mt-5 grid grid-cols-6 items-center gap-x-3 font-semibold leading-none">
                  <span className="col-span-1 text-right text-sm">
                    {ConvertSecondsToString(audio.current?.currentTime)}
                  </span>

                  <Slider
                    className="col-span-4 h-1/3"
                    defaultValue={[0]}
                    min={0}
                    max={duration + 0.01}
                    value={[time]}
                    onValueChange={(values: number[]) => {
                      if (audio.current && values[0] != undefined) {
                        audio.current.currentTime = values[0];
                      }
                    }}
                    disabled={!recordings.data?.length}
                  />

                  <span className="col-span-1 text-sm">
                    {ConvertSecondsToString(duration)}
                  </span>
                </div>
              </div>

              {recordings.data ? (
                <audio
                  preload="none"
                  ref={audio}
                  loop={isRepeat}
                  onEnded={() => {
                    setCurrentRecordingIdx((prev) => {
                      if (isShuffle) {
                        return GetRandom(0, recordings.data.length - 1);
                      }
                      if (isAutoPlay && prev < recordings.data.length - 1) {
                        return prev + 1;
                      }
                      if (!isRepeat) {
                        setIsPlaying(false);
                      }
                      return prev;
                    });
                  }}
                  onTimeUpdate={(e) => {
                    setTime(e.currentTarget.currentTime);
                  }}
                  onLoadedMetadata={(e) => {
                    setDuration(e.currentTarget.duration);
                  }}
                >
                  <source
                    type="audio/wav"
                    src={GetRecordingURL(recordings.data[currentRecordingIdx])}
                  />
                </audio>
              ) : null}
            </div>
          </div>
        </StaggerAnimation>
      </Card>
    </RevealAnimation>
  );
}
