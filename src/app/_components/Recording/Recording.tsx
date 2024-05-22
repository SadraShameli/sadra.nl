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
import { useEffect, useRef, useState } from 'react';

import RevealAnimation from '~/components/ui/Animations/Reveal';
import StaggerAnimation from '~/components/ui/Animations/Stagger';
import { Button } from '~/components/ui/Button';
import Card from '~/components/ui/Card';
import PauseIcon from '~/components/ui/Icons/Pause';
import PlayIcon from '~/components/ui/Icons/Play';
import { ScrollArea } from '~/components/ui/ScrollArea';
import { Slider } from '~/components/ui/Slider';
import {
    type getRecordingNoFileReturn,
    type getRecordingsNoFileReturn,
} from '~/types/db';

type RecordingSectionProps = {
    recordings: getRecordingsNoFileReturn;
};

const GetRandom = (min: number, max: number | undefined) => {
    if (!max) return 0;

    min = Math.ceil(min);
    max = Math.floor(max);
    return Math.floor(Math.random() * (max - min + 1)) + min;
};

const ConvertSecondsToString = (sec: number | undefined) => {
    if (sec == undefined || Number.isNaN(sec) || !Number.isFinite(sec)) {
        return;
    }

    const m = Math.floor((sec % 3600) / 60);
    const s = Math.round(sec % 60);

    const mS = m > 9 ? m : m || '0';
    const sS = s > 9 ? s : '0' + s;
    return `${mS}:${sS}`;
};

function GetRecordingURL(recording: getRecordingNoFileReturn) {
    return `/api/recording/${recording.id}`;
}

export default function RecordingSection({
    recordings,
}: RecordingSectionProps) {
    const router = useRouter();
    const audio = useRef<HTMLAudioElement>(null);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [volume, setVolume] = useState(1);
    const [prevVolume, setPrevVolume] = useState(volume);
    const [isMute, setIsMute] = useState(false);
    const [isPlaying, setIsPlaying] = useState(false);
    const [isRepeat, setIsRepeat] = useState(false);
    const [isShuffle, setIsShuffle] = useState(false);
    const [isAutoPlay, setIsAutoPlay] = useState(false);
    const [currentRecording, setCurrentRecording] = useState(recordings[0]);
    const [prevRecording, setPrevRecording] = useState(currentRecording);

    useEffect(() => {
        if (recordings.indexOf(currentRecording!) < recordings.length) {
            if (prevRecording !== currentRecording) {
                audio.current?.load();
                setPrevRecording(currentRecording);
            }
            if (isPlaying) PlayAudio();
        }
    }, [currentRecording, isPlaying, prevRecording, recordings]);

    useEffect(() => {
        audio.current!.volume = volume;
    }, [volume]);

    useEffect(() => {
        if (isMute) {
            setPrevVolume(audio.current!.volume);
            audio.current!.volume = 0;
        } else {
            audio.current!.volume = volume;
        }
    }, [isMute, prevVolume, volume]);

    function LoadAudio() {
        if (currentRecording && audio.current) {
            audio.current.src = GetRecordingURL(currentRecording);
            audio.current?.load();
            void audio.current.play();
            setCurrentTime(0);
        }
    }

    function PlayAudio() {
        void audio.current?.play();
        setIsPlaying(true);
    }

    function UpdateAudioTime(value: number) {
        audio.current!.currentTime = value;
        setCurrentTime(value);
    }

    function OnAudioTimeUpdate() {
        if (audio.current!.currentTime != 0) {
            setCurrentTime(audio.current!.currentTime);
        }
    }

    function OnAudioPrevious() {
        if (currentRecording) {
            const idx = recordings.indexOf(currentRecording);
            if (idx) setCurrentRecording(recordings[idx - 1]);
        }
    }

    function OnAudioPlause() {
        if (!isPlaying) {
            void audio.current?.play();
            setIsPlaying(true);
        } else if (audio.current?.readyState === 4) {
            if (isPlaying) {
                audio.current?.pause();
                setIsPlaying(false);
            } else PlayAudio();
        }
    }

    function OnAudioNext() {
        const idx = recordings.indexOf(currentRecording!);
        if (idx >= 0 && idx < recordings.length - 1)
            setCurrentRecording(recordings[idx + 1]);
        if (isPlaying) OnAudioPlause;
    }

    function OnAudioShuffle() {
        if (isRepeat) setIsRepeat((state) => !state);
        if (isAutoPlay)
            setCurrentRecording(recordings[GetRandom(0, recordings.length)]);
        else setIsShuffle((value) => !value);
    }

    function OnAudioRepeat() {
        if (isShuffle) setIsShuffle((state) => !state);
        setIsRepeat((state) => !state);
    }

    function OnAudioEnd() {
        setCurrentRecording((value) => {
            if (isShuffle)
                return recordings[GetRandom(0, recordings.length - 1)];
            if (isAutoPlay) {
                const idx = recordings.indexOf(currentRecording!);
                if (idx >= 0 && idx < recordings.length - 1)
                    return recordings[idx + 1];
            }
            if (!isRepeat) setIsPlaying(false);
            return value;
        });
    }

    return (
        <RevealAnimation>
            <Card>
                <StaggerAnimation className="grid-cols-2 items-center lg:grid">
                    <video loop autoPlay muted playsInline>
                        <source src="/headphone.mp4" type="video/mp4" />
                    </video>
                    <div>
                        <div className="w-full rounded-xl bg-muted p-5">
                            <div className="mx-3 mb-6 flex items-center justify-between">
                                <h4 className="font-semibold">Recordings</h4>
                                <Button
                                    className="font-semibold"
                                    size={'sm'}
                                    onClick={() =>
                                        currentRecording &&
                                        router.push(
                                            GetRecordingURL(currentRecording),
                                        )
                                    }
                                >
                                    <Download className="mr-2 size-5" />
                                    Download
                                </Button>
                            </div>
                            <ScrollArea className="h-64">
                                {recordings?.map((recording) => (
                                    <button
                                        className="flex rounded-lg px-3 py-3 font-semibold transition hover:bg-accent sm:w-11/12"
                                        onClick={() => {
                                            if (recording === currentRecording)
                                                OnAudioPlause();
                                            else {
                                                setCurrentRecording(recording);
                                                LoadAudio;
                                            }
                                        }}
                                        key={recording.id}
                                    >
                                        <div className="flex items-center gap-x-2 text-sm">
                                            {currentRecording === recording ? (
                                                <ArrowRight className="size-5" />
                                            ) : (
                                                <Music2 className="size-5" />
                                            )}
                                            {recording.file_name}
                                        </div>
                                    </button>
                                ))}
                            </ScrollArea>

                            <div className="mb-3 mt-10 grid-flow-row gap-5 xl:grid xl:grid-cols-2">
                                <div className="flex items-center justify-center gap-x-7">
                                    <button onClick={OnAudioShuffle}>
                                        <ShuffleIcon
                                            className={`size-6 text-neutral-400 transition hover:text-white ${isShuffle && 'text-white'}`}
                                        />
                                    </button>
                                    <button
                                        className="text-neutral-400 hover:text-white disabled:text-neutral-700"
                                        onClick={OnAudioPrevious}
                                        disabled={
                                            recordings.indexOf(
                                                currentRecording!,
                                            ) === 0
                                        }
                                    >
                                        <SkipBack className="size-6 transition" />
                                    </button>
                                    <button
                                        className="size-12"
                                        onClick={OnAudioPlause}
                                    >
                                        {isPlaying ? (
                                            <PauseIcon />
                                        ) : (
                                            <PlayIcon />
                                        )}
                                    </button>
                                    <button
                                        className="text-neutral-400 hover:text-white disabled:text-neutral-700"
                                        onClick={OnAudioNext}
                                        disabled={
                                            recordings.indexOf(
                                                currentRecording!,
                                            ) ===
                                            recordings.length - 1
                                        }
                                    >
                                        <SkipForward className="size-6 transition" />
                                    </button>
                                    <button onClick={OnAudioRepeat}>
                                        <Repeat
                                            className={`size-6 text-neutral-400 transition hover:text-white ${isRepeat && 'text-white'}`}
                                        />
                                    </button>
                                </div>
                                <div className="mt-5 flex items-center justify-center gap-x-3 text-neutral-400 xl:mt-0 xl:justify-end">
                                    <button
                                        onClick={() =>
                                            setIsAutoPlay((state) => !state)
                                        }
                                    >
                                        <ListEnd
                                            className={`size-6 transition hover:text-white ${isAutoPlay && 'text-white'}`}
                                        />
                                    </button>
                                    <button
                                        className="size-6 transition hover:text-white"
                                        onClick={() => {
                                            if (volume != 0) {
                                                setIsMute((state) => !state);
                                            }
                                        }}
                                    >
                                        {isMute || volume == 0 ? (
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
                                        step={0.1}
                                        onValueChange={(values: number[]) => {
                                            if (values[0] != undefined) {
                                                setVolume(values[0]);
                                            }
                                        }}
                                        disabled={isMute}
                                    />
                                </div>
                                <div className="col-span-2 mt-5 grid grid-cols-6 items-center gap-x-3 font-semibold leading-none">
                                    <span className="col-span-1 text-right text-sm">
                                        {ConvertSecondsToString(currentTime)}
                                    </span>
                                    <Slider
                                        className="col-span-4 h-1/3"
                                        defaultValue={[0]}
                                        min={0}
                                        max={
                                            currentTime
                                                ? duration
                                                : duration + 1
                                        }
                                        step={1}
                                        value={[currentTime]}
                                        onValueChange={(values: number[]) => {
                                            if (values[0] != undefined) {
                                                UpdateAudioTime(values[0]);
                                            }
                                        }}
                                    />
                                    <span className="col-span-1 text-sm">
                                        {ConvertSecondsToString(duration)}
                                    </span>
                                </div>
                            </div>
                            {currentRecording ? (
                                <audio
                                    preload="none"
                                    ref={audio}
                                    loop={isRepeat}
                                    onEnded={() => OnAudioEnd()}
                                    onTimeUpdate={OnAudioTimeUpdate}
                                    onLoadedMetadata={() =>
                                        setDuration(audio.current!.duration)
                                    }
                                >
                                    <source
                                        type="audio/wav"
                                        src={GetRecordingURL(currentRecording)}
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
