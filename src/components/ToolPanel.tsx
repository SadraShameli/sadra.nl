import { type ComponentProps, type ReactNode, type Ref } from 'react';

import { ComputingIndicator } from '~/components/ComputingIndicator';
import { ToolSectionHeading } from '~/components/ToolSectionHeading';
import { Card, CardContent, CardHeader } from '~/components/ui/card';
import InfoPopover from '~/components/ui/info-popover';
import { type TitleTag } from '~/components/ui/title-tag';
import { cn } from '~/lib/utilities';

type ToolPanelProperties = Omit<ComponentProps<typeof Card>, 'title'> & {
    readonly actions?: ReactNode;
    readonly children: ReactNode;
    readonly contentClassName?: string;
    readonly description?: ReactNode;
    readonly info?: ReactNode;
    readonly isComputing?: boolean;
    readonly title: ReactNode;
    readonly titleAs?: TitleTag;
    readonly titleId?: string;
    readonly titleReference?: Ref<HTMLHeadingElement>;
};

export function ToolPanel({
    actions,
    children,
    className,
    contentClassName,
    description,
    info,
    isComputing = false,
    title,
    titleAs = 'h2',
    titleId,
    titleReference,
    ...properties
}: ToolPanelProperties) {
    return (
        <Card
            aria-busy={isComputing || undefined}
            className={cn('app-tool__panel', 'min-w-0 gap-6', className)}
            {...properties}
        >
            <CardHeader className="items-start gap-4">
                <div className="flex min-w-0 flex-col gap-1.5">
                    <div className="flex items-center gap-2">
                        <ToolSectionHeading
                            as={titleAs}
                            id={titleId}
                            ref={titleReference}
                        >
                            {title}
                        </ToolSectionHeading>
                        {info === undefined ? null : (
                            <InfoPopover
                                title={
                                    typeof title === 'string'
                                        ? title
                                        : 'About this panel'
                                }
                            >
                                {info}
                            </InfoPopover>
                        )}
                        {isComputing ? <ComputingIndicator /> : null}
                    </div>
                    {description === undefined ? null : (
                        <p className="m-0 text-sm text-ink-muted">
                            {description}
                        </p>
                    )}
                </div>
                {actions === undefined ? null : (
                    <div className="flex flex-wrap items-center gap-2">
                        {actions}
                    </div>
                )}
            </CardHeader>
            <CardContent
                className={cn('flex flex-col gap-5', contentClassName)}
            >
                {children}
            </CardContent>
        </Card>
    );
}
