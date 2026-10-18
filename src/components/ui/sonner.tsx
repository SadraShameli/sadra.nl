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
                error: <OctagonX className="size-4" />,
                info: <Info className="size-4" />,
                loading: <LoaderCircle className="size-4 animate-spin" />,
                success: <CircleCheck className="size-4" />,
                warning: <TriangleAlert className="size-4" />,
            }}
            theme={theme as ToasterProperties['theme']}
            {...properties}
        />
    );
};

export { Toaster };
