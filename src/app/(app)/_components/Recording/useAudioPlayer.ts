import { useCallback, useEffect, useRef, useState } from 'react';

import { GetRandom, GetRecordingURL } from './helpers';
import type { PlaybackSpeed, RecordingSummary } from './types';

interface UseAudioPlayerProps {
    recordings: RecordingSummary[] | undefined;
}

export function useAudioPlayer({ recordings }: UseAudioPlayerProps) {
    const audio = useRef<HTMLAudioElement>(null);
    const [time, setTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [volume, setVolume] = useState(1);
    const [prevVolume, setPrevVolume] = useState(1);
    const [isPlaying, setIsPlaying] = useState(false);
    const [isRepeat, setIsRepeat] = useState(false);
    const [isShuffle, setIsShuffle] = useState(false);
    const [isAutoPlay, setIsAutoPlay] = useState(false);
    const [currentRecordingIdx, setCurrentRecordingIdx] = useState(0);
    const [isLoading, setIsLoading] = useState(false);
    const [playbackRate, setPlaybackRate] = useState<PlaybackSpeed>(1);
    const [durations, setDurations] = useState<Map<string, number>>(new Map());
    const fetchedDurationsRef = useRef<Set<string>>(new Set());

    const safeCurrentIdx = Math.max(
        0,
        Math.min(currentRecordingIdx, (recordings?.length ?? 1) - 1),
    );

    const playAudio = useCallback(async () => {
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

    const pauseAudio = useCallback(() => {
        if (!audio.current) return;
        audio.current.pause();
        setIsPlaying(false);
    }, []);

    const togglePlayPause = useCallback(() => {
        if (!recordings?.length || isLoading) return;
        if (!isPlaying) {
            void playAudio();
        } else {
            pauseAudio();
        }
    }, [isPlaying, recordings?.length, isLoading, playAudio, pauseAudio]);

    const handlePrevious = useCallback(() => {
        if (!recordings?.length) return;
        setCurrentRecordingIdx((prev) => Math.max(0, prev - 1));
    }, [recordings?.length]);

    const handleNext = useCallback(() => {
        if (!recordings?.length) return;
        setCurrentRecordingIdx((prev) =>
            Math.min((recordings?.length ?? 0) - 1, prev + 1),
        );
    }, [recordings?.length]);

    const handleShuffle = useCallback(() => {
        if (!recordings?.length) return;
        if (isRepeat) setIsRepeat(false);
        if (isAutoPlay) setIsAutoPlay(false);
        const nextIsShuffle = !isShuffle;
        if (nextIsShuffle && recordings.length > 1) {
            let newIdx;
            do {
                newIdx = GetRandom(0, recordings.length - 1);
            } while (newIdx === safeCurrentIdx && recordings.length > 1);
            setCurrentRecordingIdx(newIdx);
        }
        setIsShuffle(nextIsShuffle);
    }, [recordings?.length, safeCurrentIdx, isRepeat, isAutoPlay, isShuffle]);

    const handleRepeat = useCallback(() => {
        if (isShuffle) setIsShuffle(false);
        if (isAutoPlay) setIsAutoPlay(false);
        setIsRepeat((prev) => !prev);
    }, [isShuffle, isAutoPlay]);

    const handleAutoPlay = useCallback(() => {
        if (isShuffle) setIsShuffle(false);
        if (isRepeat) setIsRepeat(false);
        setIsAutoPlay((prev) => !prev);
    }, [isShuffle, isRepeat]);

    const handleRecordingSelect = useCallback(
        (recording: RecordingSummary) => {
            if (!recordings) return;
            const newIdx = recordings.indexOf(recording);
            if (newIdx !== -1) {
                setCurrentRecordingIdx(newIdx);
                if (isShuffle) setIsShuffle(false);
            }
        },
        [recordings, isShuffle],
    );

    const toggleMute = useCallback(() => {
        if (volume === 0) {
            setVolume(prevVolume);
        } else {
            setPrevVolume(volume);
            setVolume(0);
        }
    }, [volume, prevVolume]);

    const handleVolumeChange = useCallback((newVolume: number) => {
        setVolume(newVolume);
    }, []);

    const handleTimeChange = useCallback((newTime: number) => {
        if (audio.current) {
            audio.current.currentTime = newTime;
            setTime(newTime);
        }
    }, []);

    const handleSpeedChange = useCallback((speed: PlaybackSpeed) => {
        setPlaybackRate(speed);
        if (audio.current) {
            audio.current.playbackRate = speed;
        }
    }, []);

    const handleAudioEnded = useCallback(() => {
        if (!recordings?.length) return;
        setCurrentRecordingIdx((prev) => {
            if (isShuffle && recordings.length > 1) {
                let newIdx;
                do {
                    newIdx = GetRandom(0, recordings.length - 1);
                } while (newIdx === prev && recordings.length > 1);
                return newIdx;
            }
            if (isAutoPlay && prev < recordings.length - 1) {
                return prev + 1;
            }
            if (!isRepeat) {
                setIsPlaying(false);
            }
            return prev;
        });
    }, [recordings?.length, isShuffle, isAutoPlay, isRepeat]);

    const keyboardRef = useRef({
        togglePlayPause: (() => {}) as () => void,
        handleTimeChange: ((_: number) => {}) as (t: number) => void,
        handleVolumeChange: ((_: number) => {}) as (v: number) => void,
        hasRecordings: false as boolean,
        time: 0,
        volume: 1,
        duration: 0,
    });
    keyboardRef.current.togglePlayPause = togglePlayPause;
    keyboardRef.current.handleTimeChange = handleTimeChange;
    keyboardRef.current.handleVolumeChange = handleVolumeChange;
    keyboardRef.current.hasRecordings = Boolean(recordings?.length);
    keyboardRef.current.time = time;
    keyboardRef.current.volume = volume;
    keyboardRef.current.duration = duration;

    useEffect(() => {
        if (!recordings?.length || !audio.current) return;
        const recording = recordings[safeCurrentIdx];
        if (recording) {
            const newSrc = GetRecordingURL(recording);
            if (!audio.current.src.endsWith(newSrc)) {
                audio.current.src = newSrc;
                audio.current.load();
                setTime(0);
                setDuration(0);
            }
            audio.current.volume = volume;
            audio.current.playbackRate = playbackRate;
        }
    }, [safeCurrentIdx, recordings]);

    useEffect(() => {
        if (audio.current) {
            audio.current.volume = volume;
        }
    }, [volume]);

    useEffect(() => {
        if (audio.current) {
            audio.current.playbackRate = playbackRate;
        }
    }, [playbackRate]);

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

    useEffect(() => {
        if (!recordings?.length) return;
        let active = true;
        const audioElements: HTMLAudioElement[] = [];
        recordings.forEach((recording) => {
            const key = String(recording.id);
            if (fetchedDurationsRef.current.has(key)) return;
            fetchedDurationsRef.current.add(key);
            const a = new Audio();
            a.preload = 'metadata';
            a.src = GetRecordingURL(recording);
            a.onloadedmetadata = () => {
                if (active) {
                    setDurations((prev) => new Map(prev).set(key, a.duration));
                }
                a.src = '';
            };
            audioElements.push(a);
        });
        return () => {
            active = false;
            audioElements.forEach((a) => {
                a.onloadedmetadata = null;
                a.src = '';
            });
        };
    }, [recordings]);

    useEffect(() => {
        function onKeyDown(e: KeyboardEvent) {
            if (
                e.target instanceof HTMLInputElement ||
                e.target instanceof HTMLTextAreaElement
            )
                return;
            const {
                togglePlayPause,
                handleTimeChange,
                handleVolumeChange,
                hasRecordings,
                time,
                volume,
                duration,
            } = keyboardRef.current;
            if (!hasRecordings) return;
            switch (e.code) {
                case 'Space':
                    e.preventDefault();
                    togglePlayPause();
                    break;
                case 'ArrowLeft':
                    e.preventDefault();
                    handleTimeChange(Math.max(0, time - 10));
                    break;
                case 'ArrowRight':
                    e.preventDefault();
                    handleTimeChange(Math.min(duration, time + 10));
                    break;
                case 'ArrowUp':
                    e.preventDefault();
                    handleVolumeChange(
                        Math.min(1, Math.round((volume + 0.1) * 10) / 10),
                    );
                    break;
                case 'ArrowDown':
                    e.preventDefault();
                    handleVolumeChange(
                        Math.max(0, Math.round((volume - 0.1) * 10) / 10),
                    );
                    break;
            }
        }
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, []);

    const currentRecording = recordings?.[safeCurrentIdx];

    return {
        audioRef: audio,
        currentRecording,
        currentRecordingIdx: safeCurrentIdx,
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
    };
}
