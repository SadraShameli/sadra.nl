'use client';

import { Check, Link2 } from 'lucide-react';
import { useEffect, useState } from 'react';

import { Button } from '~/components/ui/Button';
import { cn } from '~/lib/utils';

export default function ShareLinkButton() {
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        if (!copied) return;
        const t = setTimeout(() => setCopied(false), 1500);
        return () => clearTimeout(t);
    }, [copied]);

    const handleCopy = async () => {
        if (typeof window === 'undefined') return;
        try {
            await navigator.clipboard.writeText(window.location.href);
            setCopied(true);
        } catch {
            return;
        }
    };

    return (
        <Button
            className={cn(
                'app-prop-calculator__share-link',
                'h-7 gap-1.5 px-2 text-xs',
            )}
            data-state={copied ? 'copied' : 'idle'}
            onClick={handleCopy}
            size="sm"
            variant="outline"
        >
            {copied ? (
                <>
                    <Check className="size-3.5" />
                    Copied
                </>
            ) : (
                <>
                    <Link2 className="size-3.5" />
                    Share link
                </>
            )}
        </Button>
    );
}
