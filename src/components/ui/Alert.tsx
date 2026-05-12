'use client';

import { cva, type VariantProps } from 'class-variance-authority';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import * as React from 'react';

import { cn } from '~/lib/utils';

const alertVariants = cva(
    'relative w-full rounded-lg border p-4 [&>svg~*]:pl-7 [&>svg+div]:translate-y-[-3px] [&>svg]:absolute [&>svg]:left-4 [&>svg]:top-4 [&>svg]:text-foreground',
    {
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
        defaultVariants: {
            variant: 'default',
        },
    },
);

type AlertProps = React.HTMLAttributes<HTMLDivElement> &
    VariantProps<typeof alertVariants> & {
        persistent?: boolean;
        autoDismissMs?: number;
    };

const AUTO_DISMISS_PARAMS = ['success', 'error'];
const FADE_DURATION_MS = 300;

const Alert = React.forwardRef<HTMLDivElement, AlertProps>(
    (
        { className, variant, persistent, autoDismissMs = 3000, ...props },
        ref,
    ) => {
        const isPersistent = persistent ?? variant === 'destructive';
        const router = useRouter();
        const pathname = usePathname();
        const searchParams = useSearchParams();
        const [visible, setVisible] = React.useState(true);
        const [mounted, setMounted] = React.useState(true);

        React.useEffect(() => {
            if (isPersistent) return;
            const fade = setTimeout(() => setVisible(false), autoDismissMs);
            const unmount = setTimeout(() => {
                setMounted(false);
                const sp = new URLSearchParams(searchParams.toString());
                let changed = false;
                for (const key of AUTO_DISMISS_PARAMS) {
                    if (sp.has(key)) {
                        sp.delete(key);
                        changed = true;
                    }
                }
                if (changed) {
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
        }, [isPersistent, autoDismissMs, pathname, router, searchParams]);

        if (!mounted && !isPersistent) return null;

        return (
            <div
                ref={ref}
                role="alert"
                className={cn(
                    alertVariants({ variant }),
                    'transition-all duration-300 ease-out',
                    visible
                        ? 'translate-y-0 opacity-100'
                        : '-translate-y-1 opacity-0',
                    className,
                )}
                {...props}
            />
        );
    },
);
Alert.displayName = 'Alert';

const AlertTitle = React.forwardRef<
    HTMLParagraphElement,
    React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
    <h5
        ref={ref}
        className={cn(
            'mb-1 leading-none font-medium tracking-tight',
            className,
        )}
        {...props}
    />
));
AlertTitle.displayName = 'AlertTitle';

const AlertDescription = React.forwardRef<
    HTMLParagraphElement,
    React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
    <div
        ref={ref}
        className={cn('text-sm [&_p]:leading-relaxed', className)}
        {...props}
    />
));
AlertDescription.displayName = 'AlertDescription';

export { Alert, AlertDescription, AlertTitle };
