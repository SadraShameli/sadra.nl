import { type ReactNode } from 'react';

interface CaptionedFigureProperties {
    caption: null | string;
    figure: ReactNode;
}

export function CaptionedFigure({
    caption,
    figure,
}: CaptionedFigureProperties) {
    return (
        <span className="flex flex-col">
            <span>{figure}</span>
            {caption !== null && (
                <span className="text-xs text-muted-foreground">{caption}</span>
            )}
        </span>
    );
}
