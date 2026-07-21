'use client';

import { cva, type VariantProps } from 'class-variance-authority';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import * as React from 'react';

import { cn } from '~/lib/utilities';

const alertVariants = cva(
    'relative w-full rounded-lg border p-4 [&>svg~*]:pl-7 [&>svg+div]:translate-y-[-3px] [&>svg]:absolute [&>svg]:left-4 [&>svg]:top-4 [&>svg]:text-foreground',
    {
        defaultVariants: {
            variant: 'default',
        },
        variants: {
            variant: {
                default: 'bg-background text-foreground',
                destructive:
                    'border-destructive/40 bg-destructive/10 text-destructive [&>svg]:text-destructive',
                success:
                    'border-emerald-500/40 bg-emerald-500/10 text-emerald-400 [&>svg]:text-emerald-400',
                warning:
                    'border-amber-500/40 bg-amber-500/10 text-amber-400 [&>svg]:text-amber-400',
            },
        },
    },
);

type AlertProperties = React.HTMLAttributes<HTMLDivElement> &
    VariantProps<typeof alertVariants> & {
        autoDismiss?: boolean;
        autoDismissMs?: number;
    };

const AUTO_DISMISS_PARAMS = ['success', 'error'];
const FADE_DURATION_MS = 300;

const Alert = React.forwardRef<HTMLDivElement, AlertProperties>(
    (
        {
            autoDismiss = false,
            autoDismissMs = 3000,
            className,
            variant,
            ...properties
        },
        reference,
    ) => {
        const router = useRouter();
        const pathname = usePathname();
        const searchParameters = useSearchParams();
        const [visible, setVisible] = React.useState(true);
        const [mounted, setMounted] = React.useState(true);

        React.useEffect(() => {
            if (!autoDismiss) return;
            const fade = setTimeout(() => setVisible(false), autoDismissMs);
            const unmount = setTimeout(() => {
                setMounted(false);
                const sp = new URLSearchParams(searchParameters.toString());
                let isChanged = false;
                for (const key of AUTO_DISMISS_PARAMS) {
                    if (!sp.has(key)) {
                        continue;
                    }

                    sp.delete(key);
                    isChanged = true;
                }
                if (isChanged) {
                    const query = sp.toString();
                    router.replace(query ? `${pathname}?${query}` : pathname, {
                        scroll: false,
                    });
                }
            }, autoDismissMs + FADE_DURATION_MS);
            return () => {
                clearTimeout(fade);
                clearTimeout(unmount);
            };
        }, [autoDismiss, autoDismissMs, pathname, router, searchParameters]);

        if (!mounted) return null;

        return (
            <div
                className={cn(
                    alertVariants({ variant }),
                    'transition-all duration-300 ease-out',
                    visible
                        ? 'translate-y-0 opacity-100'
                        : '-translate-y-1 opacity-0',
                    className,
                )}
                ref={reference}
                role="alert"
                {...properties}
            />
        );
    },
);
Alert.displayName = 'Alert';

const AlertTitle = React.forwardRef<
    HTMLParagraphElement,
    React.HTMLAttributes<HTMLHeadingElement>
>(({ children, className, ...properties }, reference) => (
    <h5
        className={cn(
            'mb-1 leading-none font-medium tracking-tight',
            className,
        )}
        ref={reference}
        {...properties}
    >
        {children}
    </h5>
));
AlertTitle.displayName = 'AlertTitle';

const AlertDescription = React.forwardRef<
    HTMLParagraphElement,
    React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...properties }, reference) => (
    <div
        className={cn('text-sm [&_p]:leading-relaxed', className)}
        ref={reference}
        {...properties}
    />
));
AlertDescription.displayName = 'AlertDescription';

export { Alert, AlertDescription, AlertTitle };
