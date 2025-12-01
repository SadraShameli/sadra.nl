import { ArrowRight, Music2 } from 'lucide-react';
import { ScrollArea } from '~/components/ui/ScrollArea';
import { type getRecordingsNoFile } from '~/server/api/routers/recording';

type Recording = NonNullable<
    Awaited<ReturnType<typeof getRecordingsNoFile>>[number]
>;

interface RecordingListProps {
    recordings: Recording[] | undefined;
    currentIdx: number;
    onSelect: (recording: Recording) => void;
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
                    {[...Array<number>(5)].map((_, index) => (
                        <div
                            className="shimmer lg:w-1-3 my-2 h-5"
                            key={index}
                        />
                    ))}
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
