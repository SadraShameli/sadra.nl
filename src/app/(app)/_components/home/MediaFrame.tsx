import { type ReactNode } from 'react';

import { cn } from '~/lib/utilities';

export enum MediaAspect {
    Photo = 'photo',
    Video = 'video',
}

const ASPECT_CLASS: Readonly<Record<MediaAspect, string>> = {
    [MediaAspect.Photo]: 'aspect-3/4',
    [MediaAspect.Video]: 'aspect-16/11',
};

export function MediaFrame({
    aspect,
    caption,
    children,
    className,
    frameClassName,
    tag,
}: {
    readonly aspect: MediaAspect;
    readonly caption?: string;
    readonly children: ReactNode;
    readonly className?: string;
    readonly frameClassName?: string;
    readonly tag?: string;
}) {
    return (
        <figure
            className={cn(
                'app-home__media',
                'm-0 flex flex-col gap-3',
                className,
            )}
        >
            <div
                className={cn(
                    'relative flex items-center justify-center overflow-hidden rounded-lg border border-line hatch',
                    ASPECT_CLASS[aspect],
                    frameClassName,
                )}
            >
                {children}
            </div>
            {caption === undefined ? null : (
                <figcaption className="flex items-baseline justify-between gap-3">
                    <span className="type-display-caption text-ink">
                        {caption}
                    </span>
                    {tag === undefined ? null : (
                        <span className="type-micro tracking-[0.18em] text-ink-muted">
                            {tag}
                        </span>
                    )}
                </figcaption>
            )}
        </figure>
    );
}
