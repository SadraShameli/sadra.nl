'use client';

import { Check, Link2, TriangleAlert } from 'lucide-react';
import { useEffect, useState } from 'react';

import { Button } from '~/components/ui/Button';
import { cn } from '~/lib/utilities';

enum ShareStatus {
    Copied = 'copied',
    Failed = 'failed',
    Idle = 'idle',
}

interface ShareLinkButtonProperties {
    buildLink: (origin: string, pathname: string) => string;
}

const FAILURE_MESSAGE = 'Could not copy';
const STATUS_RESET_MS = 1500;

export default function ShareLinkButton({
    buildLink,
}: ShareLinkButtonProperties) {
    const [status, setStatus] = useState<ShareStatus>(ShareStatus.Idle);

    useEffect(() => {
        if (status === ShareStatus.Idle) return;
        const t = setTimeout(
            () => setStatus(ShareStatus.Idle),
            STATUS_RESET_MS,
        );
        return () => clearTimeout(t);
    }, [status]);

    const handleCopy = async () => {
        if (typeof window === 'undefined') return;
        try {
            await navigator.clipboard.writeText(
                buildLink(window.location.origin, window.location.pathname),
            );
            setStatus(ShareStatus.Copied);
        } catch {
            setStatus(ShareStatus.Failed);
        }
    };

    return (
        <>
            <Button
                className={cn(
                    'app-prop-calculator__share-link',
                    'h-7 gap-1.5 px-2 text-xs',
                )}
                data-state={status}
                onClick={handleCopy}
                size="sm"
                variant="outline"
            >
                <ShareStatusLabel status={status} />
            </Button>
            <span className="sr-only" role="status">
                {status === ShareStatus.Failed ? FAILURE_MESSAGE : ''}
            </span>
        </>
    );
}

function ShareStatusLabel({ status }: { status: ShareStatus }) {
    switch (status) {
        case ShareStatus.Copied: {
            return (
                <>
                    <Check className="size-3.5" />
                    Copied
                </>
            );
        }
        case ShareStatus.Failed: {
            return (
                <>
                    <TriangleAlert className="size-3.5" />
                    {FAILURE_MESSAGE}
                </>
            );
        }
        case ShareStatus.Idle: {
            return (
                <>
                    <Link2 className="size-3.5" />
                    Share link
                </>
            );
        }
    }
}
