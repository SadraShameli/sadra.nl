import {
    ArrowDown,
    AudioLines,
    Droplet,
    type LucideIcon,
    Thermometer,
} from 'lucide-react';
import Link from 'next/link';

import { SectionTone } from '~/app/(app)/_components/SectionShell';
import { AutoplayVideo } from '~/components/AutoplayVideo';
import { homepageContent, SensorMetric } from '~/lib/site/content';
import { homeSectionHref, HomeSectionId } from '~/lib/site/homeSections';

import { Chip } from './Chip';
import { SectionHeading } from './EmphasisTitle';
import { HomeSectionShell } from './HomeSectionShell';
import { MediaAspect, MediaFrame } from './MediaFrame';

const METRIC_ICON: Readonly<Record<SensorMetric, LucideIcon>> = {
    [SensorMetric.Humidity]: Droplet,
    [SensorMetric.Loudness]: AudioLines,
    [SensorMetric.Temperature]: Thermometer,
};

export function SensorHubSection() {
    const { body, heading, linkLabel, metrics, video, videoChip } =
        homepageContent.sensorHub;
    return (
        <HomeSectionShell
            id={HomeSectionId.SensorHub}
            tone={SectionTone.Alternate}
        >
            <div className="flex flex-wrap items-center gap-16">
                <MediaFrame
                    aspect={MediaAspect.Video}
                    className="min-w-0 flex-[1_1_520px]"
                    frameClassName="rounded-xl"
                >
                    <AutoplayVideo
                        className="size-full bg-media-black object-cover"
                        video={video}
                    />
                    <Chip className="absolute top-5 left-5">{videoChip}</Chip>
                </MediaFrame>

                <div className="flex min-w-0 flex-[1_1_420px] flex-col gap-8">
                    <SectionHeading heading={heading} />
                    <p className="m-0 type-body text-ink-soft">{body}</p>
                    <ul className="m-0 flex list-none flex-col border-t border-line p-0">
                        {metrics.map((entry) => {
                            const Icon = METRIC_ICON[entry.metric];
                            return (
                                <li
                                    className="flex items-center gap-4 border-b border-line py-4.5"
                                    key={entry.metric}
                                >
                                    <Icon
                                        aria-hidden
                                        className="size-5 text-camel"
                                        strokeWidth={1.5}
                                    />
                                    <span className="flex-1 type-display-item">
                                        {entry.label}
                                    </span>
                                    <span className="font-mono text-xs text-ink-muted">
                                        {entry.unit}
                                    </span>
                                </li>
                            );
                        })}
                    </ul>
                    <Link
                        className="inline-flex w-fit items-center gap-2.5 font-mono text-xs font-medium tracking-[0.18em] text-camel uppercase focus-camel transition-[gap] hover:gap-4"
                        href={homeSectionHref(HomeSectionId.Readings)}
                    >
                        {linkLabel}
                        <ArrowDown
                            aria-hidden
                            className="size-4"
                            strokeWidth={1.8}
                        />
                    </Link>
                </div>
            </div>
        </HomeSectionShell>
    );
}
