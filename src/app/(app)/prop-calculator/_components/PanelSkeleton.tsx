import { Skeleton } from '~/components/ui/Skeleton';
import { cn } from '~/lib/utilities';

export enum PanelSkeletonSize {
    Aside = 'aside',
    Bar = 'bar',
    Panel = 'panel',
}

const HEIGHT_CLASS: Readonly<Record<PanelSkeletonSize, string>> = {
    [PanelSkeletonSize.Aside]: 'min-h-96',
    [PanelSkeletonSize.Bar]: 'h-40',
    [PanelSkeletonSize.Panel]: 'h-96',
};

interface PanelSkeletonProperties {
    size?: PanelSkeletonSize;
}

export function PanelSkeleton({
    size = PanelSkeletonSize.Panel,
}: PanelSkeletonProperties) {
    return <Skeleton className={cn(HEIGHT_CLASS[size], 'w-full rounded-xl')} />;
}
