'use client';

import { CheckCircle2, KeyRound, ShieldAlert } from 'lucide-react';
import Link from 'next/link';
import { useMemo } from 'react';

import type { CredentialDescriptor } from '~/lib/accounting-importer/credentials/index';

import { Badge } from '~/components/ui/Badge';
import { Card, CardContent } from '~/components/ui/Card';
import {
    listCredentialDescriptors,
    toneClass,
} from '~/lib/accounting-importer/credentials/index';
import { routes } from '~/lib/site/routes';
import { api } from '~/trpc/react';

export function ConnectionsHealth() {
    const summaryQ = api.accountingImporter.summary.useQuery();
    const counts = summaryQ.data ?? {};
    const descriptors = useMemo(() => listCredentialDescriptors(), []);

    const accountingReady = descriptors.some(
        (d) => d.role === 'accounting' && (counts[d.id] ?? 0) > 0,
    );

    return (
        <Link className="block" href={routes.accountingImporter.connections}>
            <Card className="py-4 transition hover:bg-card/80">
                <CardContent className="flex flex-wrap items-center justify-between gap-3 px-4">
                    <div className="flex items-center gap-3">
                        {accountingReady ? (
                            <CheckCircle2 className="size-5 text-emerald-400" />
                        ) : (
                            <ShieldAlert className="size-5 text-amber-400" />
                        )}
                        <div>
                            <div className="text-sm font-semibold">
                                {accountingReady
                                    ? 'Ready to import'
                                    : 'No accounting credential configured'}
                            </div>
                            <div className="text-xs text-muted-foreground">
                                {accountingReady
                                    ? 'Run plans, post mutations, browse ledgers and history.'
                                    : 'Add a credential with to enable posting.'}
                            </div>
                        </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        {descriptors.map((d) => (
                            <DescriptorPill
                                count={counts[d.id] ?? 0}
                                descriptor={d}
                                key={d.id}
                            />
                        ))}
                        <Badge
                            className="inline-flex items-center gap-1 text-[10px]"
                            variant="secondary"
                        >
                            <KeyRound className="size-3" /> Manage
                        </Badge>
                    </div>
                </CardContent>
            </Card>
        </Link>
    );
}

function DescriptorPill({
    count,
    descriptor,
}: {
    count: number;
    descriptor: CredentialDescriptor;
}) {
    return (
        <Badge
            className={
                count > 0
                    ? toneClass(descriptor.tone)
                    : 'bg-muted/40 text-muted-foreground'
            }
            variant="secondary"
        >
            {descriptor.label}: {count}
        </Badge>
    );
}
