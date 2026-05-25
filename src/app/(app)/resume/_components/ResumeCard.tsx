'use client';

import { Download, FileText } from 'lucide-react';
import Link from 'next/link';
import { useId, useState } from 'react';

import type { ResumeVariantKey } from '~/lib/site/content';

import { Button } from '~/components/ui/Button';
import { Label } from '~/components/ui/Label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '~/components/ui/Select';
import { routes, withQuery } from '~/lib/site/routes';

type CoverOption = { key: string; label: string };

type Resume = {
    name: string;
    role: string;
    title: string;
};
type VariantOption = { key: ResumeVariantKey; label: string };

const COVER_NONE = 'none';

export default function ResumeCard({
    coverOptions,
    defaultVariantKey,
    resume,
    variantOptions,
}: {
    coverOptions: CoverOption[];
    defaultVariantKey: ResumeVariantKey;
    resume: Resume;
    variantOptions: VariantOption[];
}) {
    const variantSelectId = useId();
    const coverSelectId = useId();
    const [variantKey, setVariantKey] =
        useState<ResumeVariantKey>(defaultVariantKey);
    const [coverKey, setCoverKey] = useState<string>(COVER_NONE);

    const activeCover = coverKey === COVER_NONE ? undefined : coverKey;
    const basePath = routes.resume.pdf(resume.name);
    const viewHref = withQuery(basePath, {
        cover: activeCover,
        variant: variantKey,
    });
    const downloadHref = withQuery(basePath, {
        cover: activeCover,
        download: '1',
        variant: variantKey,
    });

    return (
        <div className="w-full max-w-sm rounded-xl border border-border bg-card p-6">
            <p className="text-xs font-semibold tracking-widest text-muted-foreground uppercase">
                {resume.title}
            </p>
            <p className="mt-1 text-base font-semibold text-white">
                {resume.role}
            </p>

            <div className="my-5 border-t border-border" />

            <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-2">
                    <Label
                        className="text-xs text-muted-foreground"
                        htmlFor={variantSelectId}
                    >
                        Target
                    </Label>
                    <Select
                        onValueChange={(value) =>
                            setVariantKey(value as ResumeVariantKey)
                        }
                        value={variantKey}
                    >
                        <SelectTrigger id={variantSelectId}>
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {variantOptions.map((option) => (
                                <SelectItem key={option.key} value={option.key}>
                                    {option.label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                {coverOptions.length > 0 && (
                    <div className="flex flex-col gap-2">
                        <Label
                            className="text-xs text-muted-foreground"
                            htmlFor={coverSelectId}
                        >
                            Cover letter
                        </Label>
                        <Select onValueChange={setCoverKey} value={coverKey}>
                            <SelectTrigger id={coverSelectId}>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value={COVER_NONE}>None</SelectItem>
                                {coverOptions.map((option) => (
                                    <SelectItem
                                        key={option.key}
                                        value={option.key}
                                    >
                                        {option.label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                )}
            </div>

            <div className="mt-5 flex gap-2">
                <Button asChild className="flex-1" size="lg" variant="default">
                    <Link
                        href={viewHref}
                        rel="noopener noreferrer"
                        target="_blank"
                    >
                        <FileText />
                        View
                    </Link>
                </Button>
                <Button asChild className="flex-1" size="lg" variant="outline">
                    <a download href={downloadHref}>
                        <Download />
                        Download
                    </a>
                </Button>
            </div>
        </div>
    );
}
