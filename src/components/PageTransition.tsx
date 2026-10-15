import { type ReactNode, ViewTransition } from 'react';

enum PageTransitionClass {
    Fade = 'page-fade',
}

export function PageTransition({
    children,
    transitionKey,
}: {
    readonly children: ReactNode;
    readonly transitionKey?: string;
}) {
    return (
        <ViewTransition
            default="none"
            enter={PageTransitionClass.Fade}
            exit={PageTransitionClass.Fade}
            key={transitionKey}
        >
            {children}
        </ViewTransition>
    );
}
