'use client';

import { Download, FileText } from 'lucide-react';
import Link from 'next/link';
import { useId, useState } from 'react';

import type { ResumeVariantKey } from '~/lib/site/resume';

import { ToolPanel } from '~/components/ToolPanel';
import { Button } from '~/components/ui/button';
import { Label } from '~/components/ui/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '~/components/ui/select';
import { routes, withQuery } from '~/lib/site/routes';

type CoverOption = { key: string; label: string };

type Resume = {
    name: string;
    role: string;
};
type VariantOption = { key: ResumeVariantKey; label: string };

const COVER_NONE = 'none';
const COVER_NONE_LABEL = 'None';

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
        <ToolPanel title={resume.role}>
            <div className="grid gap-4 md:grid-cols-2">
                <div className="flex flex-col gap-2">
                    <Label
                        className="text-xs text-muted-foreground"
                        htmlFor={variantSelectId}
                    >
                        Target
                    </Label>
                    <Select
                        onValueChange={(value) =>
                            setVariantKey(
                                variantOptions.find(
                                    (option) => option.key === value,
                                )?.key ?? variantKey,
                            )
                        }
                        value={variantKey}
                    >
                        <SelectTrigger id={variantSelectId}>
                            <SelectValue>
                                {
                                    variantOptions.find(
                                        (option) => option.key === variantKey,
                                    )?.label
                                }
                            </SelectValue>
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
                                <SelectValue>
                                    {coverKey === COVER_NONE
                                        ? COVER_NONE_LABEL
                                        : coverOptions.find(
                                              (option) =>
                                                  option.key === coverKey,
                                          )?.label}
                                </SelectValue>
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value={COVER_NONE}>
                                    {COVER_NONE_LABEL}
                                </SelectItem>
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

            <div className="flex gap-2 md:justify-end">
                <Button
                    asChild
                    className="flex-1 md:flex-none"
                    size="lg"
                    variant="default"
                >
                    <Link
                        href={viewHref}
                        rel="noopener noreferrer"
                        target="_blank"
                    >
                        <FileText />
                        View
                    </Link>
                </Button>
                <Button
                    asChild
                    className="flex-1 md:flex-none"
                    size="lg"
                    variant="outline"
                >
                    <a download href={downloadHref}>
                        <Download />
                        Download
                    </a>
                </Button>
            </div>
        </ToolPanel>
    );
}
