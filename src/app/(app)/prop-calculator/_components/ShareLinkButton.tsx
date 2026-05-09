'use client';

import { Check, Link2 } from 'lucide-react';
import { useEffect, useState } from 'react';

import { Button } from '~/components/ui/Button';

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
            variant="outline"
            size="sm"
            className="h-7 gap-1.5 px-2 text-xs"
            onClick={handleCopy}
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
