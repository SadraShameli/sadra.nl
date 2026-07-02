import { useCallback, useEffect, useRef, useState } from 'react';

import type { PlaybackSpeed, RecordingSummary } from './types';

import { GetRandom, GetRecordingURL } from './helpers';

interface UseAudioPlayerProperties {
    recordings: RecordingSummary[] | undefined;
}

export function useAudioPlayer({ recordings }: UseAudioPlayerProperties) {
    const audio = useRef<HTMLAudioElement>(null);
    const [time, setTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [volume, setVolume] = useState(1);
    const [previousVolume, setPreviousVolume] = useState(1);
    const [isPlaying, setIsPlaying] = useState(false);
    const [isRepeat, setIsRepeat] = useState(false);
    const [isShuffle, setIsShuffle] = useState(false);
    const [isAutoPlay, setIsAutoPlay] = useState(false);
    const [currentRecordingIndex, setCurrentRecordingIndex] = useState(0);
    const [playbackRate, setPlaybackRate] = useState<PlaybackSpeed>(1);

    const safeCurrentIndex = Math.max(
        0,
        Math.min(currentRecordingIndex, (recordings?.length ?? 1) - 1),
    );

    const playAudio = useCallback(async () => {
        if (!audio.current) return;
        try {
            await audio.current.play();
            setIsPlaying(true);
        } catch (error) {
            console.error('Failed to play audio:', error);
            setIsPlaying(false);
        }
    }, []);

    const pauseAudio = useCallback(() => {
        if (!audio.current) return;
        audio.current.pause();
        setIsPlaying(false);
    }, []);

    const togglePlayPause = useCallback(() => {
        if (!recordings?.length) return;
        if (isPlaying) {
            pauseAudio();
        } else {
            void playAudio();
        }
    }, [isPlaying, recordings?.length, playAudio, pauseAudio]);

    const handlePrevious = useCallback(() => {
        if (!recordings?.length) return;
        setCurrentRecordingIndex((previous) => Math.max(0, previous - 1));
    }, [recordings?.length]);

    const handleNext = useCallback(() => {
        if (!recordings?.length) return;
        setCurrentRecordingIndex((previous) =>
            Math.min(recordings.length - 1, previous + 1),
        );
    }, [recordings?.length]);

    const handleShuffle = useCallback(() => {
        if (!recordings?.length) return;
        if (isRepeat) setIsRepeat(false);
        if (isAutoPlay) setIsAutoPlay(false);
        const isNextIsShuffle = !isShuffle;
        if (isNextIsShuffle && recordings.length > 1) {
            let newIndex;
            do {
                newIndex = GetRandom(0, recordings.length - 1);
            } while (newIndex === safeCurrentIndex && recordings.length > 1);
            setCurrentRecordingIndex(newIndex);
        }
        setIsShuffle(isNextIsShuffle);
    }, [recordings?.length, safeCurrentIndex, isRepeat, isAutoPlay, isShuffle]);

    const handleRepeat = useCallback(() => {
        if (isShuffle) setIsShuffle(false);
        if (isAutoPlay) setIsAutoPlay(false);
        setIsRepeat((previous) => !previous);
    }, [isShuffle, isAutoPlay]);

    const handleAutoPlay = useCallback(() => {
        if (isShuffle) setIsShuffle(false);
        if (isRepeat) setIsRepeat(false);
        setIsAutoPlay((previous) => !previous);
    }, [isShuffle, isRepeat]);

    const handleRecordingSelect = useCallback(
        (recording: RecordingSummary) => {
            if (!recordings) return;
            const newIndex = recordings.indexOf(recording);
            if (newIndex !== -1) {
                setCurrentRecordingIndex(newIndex);
                if (isShuffle) setIsShuffle(false);
            }
        },
        [recordings, isShuffle],
    );

    const toggleMute = useCallback(() => {
        if (volume === 0) {
            setVolume(previousVolume);
        } else {
            setPreviousVolume(volume);
            setVolume(0);
        }
    }, [volume, previousVolume]);

    const handleVolumeChange = useCallback((newVolume: number) => {
        setVolume(newVolume);
    }, []);

    const handleTimeChange = useCallback((newTime: number) => {
        if (!audio.current) {
            return;
        }

        audio.current.currentTime = newTime;
        setTime(newTime);
    }, []);

    const handleSpeedChange = useCallback((speed: PlaybackSpeed) => {
        setPlaybackRate(speed);
        if (audio.current) {
            audio.current.playbackRate = speed;
        }
    }, []);

    const handleAudioEnded = useCallback(() => {
        if (!recordings?.length) return;
        setCurrentRecordingIndex((previous) => {
            if (isShuffle && recordings.length > 1) {
                let newIndex;
                do {
                    newIndex = GetRandom(0, recordings.length - 1);
                } while (newIndex === previous && recordings.length > 1);
                return newIndex;
            }
            if (isAutoPlay && previous < recordings.length - 1) {
                return previous + 1;
            }
            if (!isRepeat) {
                setIsPlaying(false);
            }
            return previous;
        });
    }, [recordings?.length, isShuffle, isAutoPlay, isRepeat]);

    const keyboardReference = useRef({
        duration,
        handleTimeChange,
        handleVolumeChange,
        hasRecordings: Boolean(recordings?.length),
        time,
        togglePlayPause,
        volume,
    });
    keyboardReference.current.togglePlayPause = togglePlayPause;
    keyboardReference.current.handleTimeChange = handleTimeChange;
    keyboardReference.current.handleVolumeChange = handleVolumeChange;
    keyboardReference.current.hasRecordings = Boolean(recordings?.length);
    keyboardReference.current.time = time;
    keyboardReference.current.volume = volume;
    keyboardReference.current.duration = duration;

    useEffect(() => {
        if (!recordings?.length || !audio.current) return;
        const recording = recordings[safeCurrentIndex];
        if (recording) {
            const newSource = GetRecordingURL(recording);
            if (!audio.current.src.endsWith(newSource)) {
                audio.current.src = newSource;
                audio.current.load();
                setTime(0);
                setDuration(0);
            }
            audio.current.volume = volume;
            audio.current.playbackRate = playbackRate;
        }
    }, [playbackRate, recordings, safeCurrentIndex, volume]);

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
        if (currentRecordingIndex !== safeCurrentIndex) {
            setCurrentRecordingIndex(safeCurrentIndex);
        }
    }, [safeCurrentIndex, currentRecordingIndex]);

    useEffect(() => {
        const audioElement = audio.current;
        return () => {
            if (!audioElement) {
                return;
            }

            audioElement.pause();
            audioElement.src = '';
        };
    }, []);

    useEffect(() => {
        function onKeyDown(e: KeyboardEvent) {
            if (
                e.target instanceof HTMLInputElement ||
                e.target instanceof HTMLTextAreaElement
            )
                return;
            const {
                duration,
                handleTimeChange,
                handleVolumeChange,
                hasRecordings,
                time,
                togglePlayPause,
                volume,
            } = keyboardReference.current;
            if (!hasRecordings) return;
            switch (e.code) {
                case 'ArrowDown': {
                    e.preventDefault();
                    handleVolumeChange(
                        Math.max(0, Math.round((volume - 0.1) * 10) / 10),
                    );
                    break;
                }
                case 'ArrowLeft': {
                    e.preventDefault();
                    handleTimeChange(Math.max(0, time - 10));
                    break;
                }
                case 'ArrowRight': {
                    e.preventDefault();
                    handleTimeChange(Math.min(duration, time + 10));
                    break;
                }
                case 'ArrowUp': {
                    e.preventDefault();
                    handleVolumeChange(
                        Math.min(1, Math.round((volume + 0.1) * 10) / 10),
                    );
                    break;
                }
                case 'Space': {
                    e.preventDefault();
                    togglePlayPause();
                    break;
                }
            }
        }
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, []);

    const currentRecording = recordings?.[safeCurrentIndex];

    return {
        audioRef: audio,
        currentRecording,
        currentRecordingIdx: safeCurrentIndex,
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
