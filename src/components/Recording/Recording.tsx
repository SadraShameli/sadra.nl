'use client';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import RevealAnimation from '~/components/ui/Animations/Reveal';
import StaggerAnimation from '~/components/ui/Animations/Stagger';
import Card from '~/components/ui/Card';
import PlayIcon from '~/components/ui/Icons/Play';
import PlayBackIcon from '~/components/ui/Icons/PlayBack';
import PlayForwardIcon from '~/components/ui/Icons/PlayForward';
import RepeatIcon from '~/components/ui/Icons/Repeat';
import ShuffleIcon from '~/components/ui/Icons/Shuffle';
import { type getRecordingNoFileReturn, type getRecordingsNoFileReturn } from '~/types/db';

import ArrowRightIcon from '../ui/Icons/ArrowRight';
import ContinueIcon from '../ui/Icons/Continue';
import DownloadIcon from '../ui/Icons/Download';
import MusicIcon from '../ui/Icons/Music';
import PauseIcon from '../ui/Icons/Pause';
import VolumeMuteIcon from '../ui/Icons/VolumeMute';
import VolumeUpIcon from '../ui/Icons/VolumeUp';
import { ScrollArea } from '../ui/ScrollArea';
import { Slider } from '../ui/Slider';

type RecordingSectionProps = {
    recordings: getRecordingsNoFileReturn;
};

const GetRandom = (min: number, max: number | undefined) => {
    if (!max) return 0;

    min = Math.ceil(min);
    max = Math.floor(max);
    return Math.floor(Math.random() * (max - min + 1)) + min;
};

function GetRecordingURL(recording: getRecordingNoFileReturn) {
    return `/api/recording/${recording.id}`;
}

export default function RecordingSection({ recordings }: RecordingSectionProps) {
    const router = useRouter();
    const audio = useRef<HTMLAudioElement>(null);
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
        }
    }

    function PlayAudio() {
        void audio.current?.play();
        setIsPlaying(true);
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
        if (idx >= 0 && idx < recordings.length - 1) setCurrentRecording(recordings[idx + 1]);
        if (isPlaying) OnAudioPlause;
    }

    function OnAudioShuffle() {
        if (isRepeat) setIsRepeat((state) => !state);
        if (isAutoPlay) setCurrentRecording(recordings[GetRandom(0, recordings.length)]);
        else setIsShuffle((value) => !value);
    }

    function OnAudioRepeat() {
        if (isShuffle) setIsShuffle((state) => !state);
        setIsRepeat((state) => !state);
    }

    function OnAudioEnd() {
        setCurrentRecording((value) => {
            if (isShuffle) return recordings[GetRandom(0, recordings.length - 1)];
            if (isAutoPlay) {
                const idx = recordings.indexOf(currentRecording!);
                if (idx >= 0 && idx < recordings.length - 1) return recordings[idx + 1];
            }
            if (!isRepeat) setIsPlaying(false);
            return value;
        });
    }

    return (
        <RevealAnimation>
            <Card>
                <StaggerAnimation className='grid-cols-2 items-center lg:grid'>
                    <video loop autoPlay muted playsInline>
                        <source src='/headphone.mp4' type='video/mp4' />
                    </video>
                    <div>
                        <div className='w-full rounded-xl bg-neutral-950 p-5'>
                            <div className='mx-3 mb-6 flex items-center justify-between'>
                                <h4 className='font-semibold'>Recordings</h4>
                                <button
                                    className='flex items-center gap-x-1 rounded-lg bg-white px-2 py-1 text-sm font-semibold text-black transition duration-300 ease-out hover:scale-105'
                                    onClick={() => currentRecording && router.push(GetRecordingURL(currentRecording))}
                                >
                                    <DownloadIcon className='size-5' />
                                    Download
                                </button>
                            </div>
                            <ScrollArea className='h-64 sm:h-80'>
                                {recordings?.map((recording) => (
                                    <button
                                        className='flex rounded-lg px-3 py-3 font-semibold transition hover:bg-neutral-900 sm:w-11/12'
                                        onClick={() => {
                                            if (recording === currentRecording) OnAudioPlause();
                                            else {
                                                setCurrentRecording(recording);
                                                LoadAudio;
                                            }
                                        }}
                                        key={recording.id}
                                    >
                                        <div className='flex items-center gap-x-2 text-sm'>
                                            {currentRecording === recording ? <ArrowRightIcon className='size-7' /> : <MusicIcon className='size-7' />}
                                            {recording.file_name}
                                        </div>
                                    </button>
                                ))}
                            </ScrollArea>

                            <div className='mt-8 grid xl:grid-cols-2'>
                                <div className='flex items-center justify-center gap-x-7'>
                                    <button onClick={OnAudioShuffle}>
                                        <ShuffleIcon className={`size-6 text-neutral-400 transition hover:text-white ${isShuffle && 'text-white'}`} />
                                    </button>
                                    <button
                                        className='text-neutral-400 hover:text-white disabled:text-neutral-700'
                                        onClick={OnAudioPrevious}
                                        disabled={recordings.indexOf(currentRecording!) === 0}
                                    >
                                        <PlayBackIcon className='size-6 transition' />
                                    </button>
                                    <button className='size-12 text-white' onClick={OnAudioPlause}>
                                        {isPlaying ? <PauseIcon /> : <PlayIcon />}
                                    </button>
                                    <button
                                        className='text-neutral-400 hover:text-white disabled:text-neutral-700'
                                        onClick={OnAudioNext}
                                        disabled={recordings.indexOf(currentRecording!) === recordings.length - 1}
                                    >
                                        <PlayForwardIcon className='size-6 transition' />
                                    </button>
                                    <button onClick={OnAudioRepeat}>
                                        <RepeatIcon className={`size-6 text-neutral-400 transition hover:text-white ${isRepeat && 'text-white'}`} />
                                    </button>
                                </div>

                                <div className='mt-5 flex items-center justify-center gap-x-3 text-neutral-400 xl:mt-0 xl:justify-end'>
                                    <button onClick={() => setIsAutoPlay((state) => !state)}>
                                        <ContinueIcon className={`size-6 transition hover:text-white ${isAutoPlay && 'text-white'}`} />
                                    </button>
                                    <button className='size-6 transition hover:text-white' onClick={() => setIsMute((state) => !state)}>
                                        {isMute ? <VolumeMuteIcon className='text-white' /> : <VolumeUpIcon />}
                                    </button>
                                    <Slider
                                        className='h-2 w-2/5'
                                        defaultValue={[1]}
                                        value={[volume]}
                                        min={0}
                                        max={1}
                                        step={0.1}
                                        onValueChange={(e) => setVolume(e as unknown as number)}
                                        disabled={isMute}
                                    />
                                </div>
                                {currentRecording ? (
                                    <audio ref={audio} onEnded={() => OnAudioEnd()} loop={isRepeat} preload='none'>
                                        <source src={GetRecordingURL(currentRecording)} type='audio/wav'></source>
                                    </audio>
                                ) : null}
                            </div>
                        </div>
                    </div>
                </StaggerAnimation>
            </Card>
        </RevealAnimation>
    );
}
