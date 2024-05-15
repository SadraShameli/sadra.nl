'use client';
import { type Prisma } from '@prisma/client';
import { useState } from 'react';

import RevealAnimation from '~/components/ui/Animations/Reveal';
import StaggerAnimation from '~/components/ui/Animations/Stagger';
import Card from '~/components/ui/Card';
import PlayIcon from '~/components/ui/Icons/Play';
import PlayBackIcon from '~/components/ui/Icons/PlayBack';
import PlayForwardIcon from '~/components/ui/Icons/PlayForward';
import RepeatIcon from '~/components/ui/Icons/Repeat';
import ShuffleIcon from '~/components/ui/Icons/Shuffle';
import { type getRecordingsNoFile } from '~/server/api/routers/recording';

import ContinueIcon from '../ui/Icons/Continue';
import DownloadIcon from '../ui/Icons/Download';
import LocationIcon from '../ui/Icons/Location';
import MusicIcon from '../ui/Icons/Music';
import PauseIcon from '../ui/Icons/Pause';
import VolumeMuteIcon from '../ui/Icons/VolumeMute';
import VolumeUpIcon from '../ui/Icons/VolumeUp';
import { Progress } from '../ui/Progress';
import { ScrollArea } from '../ui/ScrollArea';

interface RecordingSectionProps {
    recordings: Prisma.PromiseReturnType<typeof getRecordingsNoFile>;
}

export default function RecordingSection({ recordings }: RecordingSectionProps) {
    const [isPlaying, useIsPlaying] = useState(false);
    const [isMute, useIsMute] = useState(false);
    const [isRepeat, useIsRepeat] = useState(false);
    const [isShuffle, useIsShuffle] = useState(false);
    const [autoPlay, useAutoPlay] = useState(false);
    const [currentRecording, useCurrentRecording] = useState(recordings[0]);

    return (
        <RevealAnimation>
            <Card>
                <StaggerAnimation>
                    <div className='grid grid-flow-col grid-cols-3 items-center'>
                        <video className='col-span-2 size-full' loop autoPlay muted>
                            <source src='/headphone.mp4' type='video/mp4' />
                        </video>
                        <div className='rounded-xl bg-neutral-950 p-5'>
                            <div className='mx-3 mb-6 flex items-center justify-between'>
                                <h4 className='font-semibold'>Recordings</h4>
                                <button className='flex items-center gap-x-2 rounded-lg bg-white p-2 text-sm font-semibold text-black transition duration-300 ease-out hover:scale-105'>
                                    <LocationIcon className='size-5' />
                                    Locations
                                </button>
                            </div>
                            <ScrollArea className='h-80'>
                                {recordings?.map((recording) => (
                                    <button className='flex w-11/12 rounded-lg py-3 pl-3 font-semibold transition hover:bg-neutral-900' key={recording.id}>
                                        <div className='flex items-center gap-x-2 text-sm'>
                                            <MusicIcon className='size-7' />
                                            {recording.file_name}
                                        </div>
                                    </button>
                                ))}
                            </ScrollArea>
                        </div>
                    </div>

                    <div className='mt-20 grid grid-flow-col grid-cols-3'>
                        <button
                            className='flex w-fit items-center justify-center rounded-lg bg-white px-4 py-3 font-semibold text-black transition duration-300 ease-out hover:scale-105'
                            onClick={async () => {
                                if (currentRecording) {
                                    const response = await fetch(`http://localhost:3000/api/recording/${currentRecording.id}`);
                                    const filename = response.headers.get('content-disposition')?.split('filename="')[1]?.split('"')[0];
                                    if (filename) {
                                        const url = window.URL.createObjectURL(await response.blob());
                                        const a = document.createElement('a');
                                        a.href = url;
                                        a.download = filename ? filename : '';
                                        document.body.appendChild(a);
                                        a.onclick = () => document.body.removeChild(a);
                                        a.click();
                                    }
                                }
                            }}
                        >
                            <DownloadIcon className='mr-3 size-6' />
                            Download
                        </button>

                        <div className='mx-auto flex items-center justify-center space-x-7'>
                            <button
                                onClick={() => {
                                    // eslint-disable-next-line react-hooks/rules-of-hooks
                                    useIsShuffle((state) => !state);
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
                                    useIsPlaying((state) => !state);
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
                                    useIsRepeat((state) => !state);
                                }}
                            >
                                <RepeatIcon className={`size-6 text-neutral-400 transition hover:text-white ${isRepeat && 'text-white'}`} />
                            </button>
                        </div>

                        <div className='flex items-center justify-end space-x-3 self-center text-neutral-400'>
                            <button
                                onClick={() => {
                                    // eslint-disable-next-line react-hooks/rules-of-hooks
                                    useAutoPlay((state) => !state);
                                }}
                            >
                                <ContinueIcon className={`size-6 transition hover:text-white ${autoPlay && 'text-white'}`} />
                            </button>
                            <button
                                className='size-6 transition hover:text-white'
                                onClick={() => {
                                    // eslint-disable-next-line react-hooks/rules-of-hooks
                                    useIsMute((state) => !state);
                                }}
                            >
                                {isMute ? <VolumeMuteIcon className='text-white' /> : <VolumeUpIcon />}
                            </button>
                            <Progress className='ml-3 h-2 w-2/5' value={33} />
                        </div>
                    </div>
                </StaggerAnimation>
            </Card>
        </RevealAnimation>
    );
}
