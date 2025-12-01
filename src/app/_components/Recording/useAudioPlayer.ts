import { useCallback, useEffect, useRef, useState } from 'react';
import { type getRecordingNoFile } from '~/server/api/routers/recording';
import { GetRandom, GetRecordingURL } from './helpers';

type Recording = Awaited<ReturnType<typeof getRecordingNoFile>>;

interface UseAudioPlayerProps {
    recordings: Recording[] | undefined;
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

        setIsShuffle((prev) => {
            if (!prev && recordings.length > 1) {
                let newIdx;
                do {
                    newIdx = GetRandom(0, recordings.length - 1);
                } while (newIdx === safeCurrentIdx && recordings.length > 1);
                setCurrentRecordingIdx(newIdx);
            }
            return !prev;
        });
    }, [recordings?.length, safeCurrentIdx, isRepeat, isAutoPlay]);

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
        (recording: Recording) => {
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

    useEffect(() => {
        if (!recordings?.length || !audio.current) return;

        const recording = recordings[safeCurrentIdx];
        if (recording) {
            const newSrc = GetRecordingURL(recording);
            if (audio.current.src !== newSrc) {
                audio.current.src = newSrc;
                audio.current.load();
                setTime(0);
                setDuration(0);
            }
        }
    }, [safeCurrentIdx, recordings]);

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

    const currentRecording = recordings?.[safeCurrentIdx];
    const audioSrc = currentRecording ? GetRecordingURL(currentRecording) : '';

    return {
        audioRef: audio,
        time,
        duration,
        volume,
        isPlaying,
        isRepeat,
        isShuffle,
        isAutoPlay,
        isLoading,
        currentRecordingIdx: safeCurrentIdx,
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
    };
}
