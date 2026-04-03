import { ArrowRight, Music2 } from 'lucide-react';
import { ScrollArea } from '~/components/ui/ScrollArea';

import type { RecordingSummary } from './types';

interface RecordingListProps {
    recordings: RecordingSummary[] | undefined;
    currentIdx: number;
    onSelect: (recording: RecordingSummary) => void;
}

export function RecordingList({
    recordings,
    currentIdx,
    onSelect,
}: RecordingListProps) {
    if (!recordings || recordings.length === 0) {
        return (
            <div className="my-5 grid h-[27vh] lg:h-[25vh]">
                <ScrollArea>
                    <div className="text-muted-foreground flex h-full flex-col items-center justify-center gap-2 text-center text-xs">
                        <p className="mt-10">No recordings yet</p>
                    </div>
                </ScrollArea>
            </div>
        );
    }

    return (
        <div className="my-5 grid h-[27vh] lg:h-[25vh]">
            <ScrollArea>
                {recordings.map((recording, index) => {
                    if (!recording) return null;
                    return (
                        <button
                            className="hover:bg-accent flex rounded-lg p-3 font-semibold transition lg:w-11/12"
                            onClick={() => onSelect(recording)}
                            key={recording.id}
                        >
                            <div className="flex items-center gap-x-2 text-sm">
                                {index === currentIdx ? (
                                    <ArrowRight className="size-5" />
                                ) : (
                                    <Music2 className="size-5" />
                                )}
                                {recording.file_name}
                            </div>
                        </button>
                    );
                })}
            </ScrollArea>
        </div>
    );
}
