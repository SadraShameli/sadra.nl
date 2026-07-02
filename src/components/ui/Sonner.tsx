'use client';

import {
    CircleCheck,
    Info,
    LoaderCircle,
    OctagonX,
    TriangleAlert,
} from 'lucide-react';
import { useTheme } from 'next-themes';
import { Toaster as Sonner } from 'sonner';

type ToasterProperties = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...properties }: ToasterProperties) => {
    const { theme = 'system' } = useTheme();

    return (
        <Sonner
            className="toaster group"
            icons={{
                error: <OctagonX className="h-4 w-4" />,
                info: <Info className="h-4 w-4" />,
                loading: <LoaderCircle className="h-4 w-4 animate-spin" />,
                success: <CircleCheck className="h-4 w-4" />,
                warning: <TriangleAlert className="h-4 w-4" />,
            }}
            theme={theme as ToasterProperties['theme']}
            toastOptions={{
                classNames: {
                    actionButton:
                        'group-[.toast]:bg-primary group-[.toast]:text-primary-foreground',
                    cancelButton:
                        'group-[.toast]:bg-muted group-[.toast]:text-muted-foreground',
                    description: 'group-[.toast]:text-muted-foreground',
                    toast: 'group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg',
                },
            }}
            {...properties}
        />
    );
};

export { Toaster };
