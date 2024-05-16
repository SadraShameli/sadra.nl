'use client';
import { useState } from 'react';

import RevealAnimation from '~/components/ui/Animations/Reveal';
import StaggerAnimation from '~/components/ui/Animations/Stagger';
import Card from '~/components/ui/Card';
import PlayIcon from '~/components/ui/Icons/Play';
import PlayBackIcon from '~/components/ui/Icons/PlayBack';
import PlayForwardIcon from '~/components/ui/Icons/PlayForward';
import RepeatIcon from '~/components/ui/Icons/Repeat';
import ShuffleIcon from '~/components/ui/Icons/Shuffle';
import { type getRecordingsNoFileReturn } from '~/types/db';

import ContinueIcon from '../ui/Icons/Continue';
import DownloadIcon from '../ui/Icons/Download';
import MusicIcon from '../ui/Icons/Music';
import PauseIcon from '../ui/Icons/Pause';
import VolumeMuteIcon from '../ui/Icons/VolumeMute';
import VolumeUpIcon from '../ui/Icons/VolumeUp';
import { Progress } from '../ui/Progress';
import { ScrollArea } from '../ui/ScrollArea';

type RecordingSectionProps = {
    recordings: getRecordingsNoFileReturn;
};

export default function RecordingSection({ recordings }: RecordingSectionProps) {
    const [isPlaying, setIsPlaying] = useState(false);
    const [isMute, setIsMute] = useState(false);
    const [isRepeat, setIsRepeat] = useState(false);
    const [isShuffle, setIsShuffle] = useState(false);
    const [autoPlay, setAutoPlay] = useState(false);
    const [currentRecording, setCurrentRecording] = useState(recordings[0]);

    return (
        <RevealAnimation>
            <Card>
                <StaggerAnimation className='grid-cols-2 items-center lg:grid'>
                    <video loop autoPlay muted>
                        <source src='/headphone.mp4' type='video/mp4' />
                    </video>
                    <div>
                        <div className='w-full rounded-xl bg-neutral-950 p-5'>
                            <div className='mx-3 mb-6 flex items-center justify-between'>
                                <h4 className='font-semibold'>Recordings</h4>
                                <button
                                    className='flex items-center gap-x-1 rounded-lg bg-white px-2 py-1 text-sm font-semibold text-black transition duration-300 ease-out hover:scale-105'
                                    onClick={async () => {
                                        if (currentRecording) {
                                            if (currentRecording.file_name) {
                                                const a = document.createElement('a');
                                                a.href = `/api/recording/${currentRecording.id}`;
                                                document.body.appendChild(a);
                                                a.onclick = () => document.body.removeChild(a);
                                                a.click();
                                            }
                                        }
                                    }}
                                >
                                    <DownloadIcon className='size-5' />
                                    Download
                                </button>
                            </div>
                            <ScrollArea className='h-80'>
                                {recordings?.map((recording) => (
                                    <button
                                        className='flex rounded-lg px-3 py-3 font-semibold transition hover:bg-neutral-900 sm:w-11/12'
                                        onClick={() => {
                                            // eslint-disable-next-line react-hooks/rules-of-hooks
                                            setCurrentRecording(recording);
                                        }}
                                        key={recording.id}
                                    >
                                        <div className='flex items-center gap-x-2 text-sm'>
                                            <MusicIcon className='size-7' />
                                            {recording.file_name}
                                        </div>
                                    </button>
                                ))}
                            </ScrollArea>

                            <div className='mt-8 grid xl:grid-cols-2'>
                                <div className='flex items-center justify-center gap-x-7'>
                                    <button
                                        onClick={() => {
                                            // eslint-disable-next-line react-hooks/rules-of-hooks
                                            setIsShuffle((state) => !state);
                                        }}
                                    >
                                        <ShuffleIcon className={`size-6 text-neutral-400 transition hover:text-white ${isShuffle && 'text-white'}`} />
                                    </button>
                                    <button>
                                        <PlayBackIcon className='size-6 text-neutral-400 transition hover:text-white' />
                                    </button>
                                    <button
                                        className='size-12 text-white'
                                        onClick={() => {
                                            // eslint-disable-next-line react-hooks/rules-of-hooks
                                            setIsPlaying((state) => !state);
                                        }}
                                    >
                                        {isPlaying ? <PauseIcon /> : <PlayIcon />}
                                    </button>
                                    <button>
                                        <PlayForwardIcon className='size-6 text-neutral-400 transition hover:text-white' />
                                    </button>
                                    <button
                                        onClick={() => {
                                            // eslint-disable-next-line react-hooks/rules-of-hooks
                                            setIsRepeat((state) => !state);
                                        }}
                                    >
                                        <RepeatIcon className={`size-6 text-neutral-400 transition hover:text-white ${isRepeat && 'text-white'}`} />
                                    </button>
                                </div>

                                <div className='mt-5 flex items-center justify-center gap-x-3 text-neutral-400 xl:mt-0 xl:justify-end'>
                                    <button
                                        onClick={() => {
                                            // eslint-disable-next-line react-hooks/rules-of-hooks
                                            setAutoPlay((state) => !state);
                                        }}
                                    >
                                        <ContinueIcon className={`size-6 transition hover:text-white ${autoPlay && 'text-white'}`} />
                                    </button>
                                    <button
                                        className='size-6 transition hover:text-white'
                                        onClick={() => {
                                            // eslint-disable-next-line react-hooks/rules-of-hooks
                                            setIsMute((state) => !state);
                                        }}
                                    >
                                        {isMute ? <VolumeMuteIcon className='text-white' /> : <VolumeUpIcon />}
                                    </button>
                                    <Progress className='h-2 w-2/5' value={33} />
                                </div>
                            </div>
                        </div>
                    </div>
                </StaggerAnimation>
            </Card>
        </RevealAnimation>
    );
}
