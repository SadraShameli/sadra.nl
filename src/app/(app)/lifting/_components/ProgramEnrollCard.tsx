'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Check, Copy, Play } from 'lucide-react';
import { useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

import type { ProgramBlock } from '~/lib/lifting/types';

import { Button } from '~/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/Card';
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from '~/components/ui/Form';
import { Input } from '~/components/ui/Input';
import { WeightUnit } from '~/lib/lifting/format';
import {
    type EnrollProgramInput,
    enrollProgramInputSchema,
} from '~/lib/lifting/schemas';
import { api, type RouterOutputs } from '~/trpc/react';

type Program = RouterOutputs['lifting']['program']['get'];

interface ProgramEnrollCardProperties {
    program: Program;
}

export function ProgramEnrollCard({ program }: ProgramEnrollCardProperties) {
    const utilities = api.useUtils();
    const mine = api.lifting.program.listMine.useQuery();
    const settings = api.lifting.settings.get.useQuery();
    const unitWeight = settings.data?.unitWeight ?? 'kg';
    const isEnrolled = Boolean(
        mine.data?.enrollments.some(
            (enrollment) =>
                enrollment.programId === program.id &&
                enrollment.status === 'active',
        ),
    );
    const isCloned = Boolean(
        mine.data?.owned.some((p) => p.name === program.name),
    );
    const enroll = api.lifting.program.enroll.useMutation({
        onError: (error) => toast.error(error.message),
        onSuccess: async () => {
            toast.success('Enrolled. Start your first session.');
            await utilities.lifting.program.listMine.invalidate();
        },
    });
    const clone = api.lifting.program.cloneToCustom.useMutation({
        onError: (error) => toast.error(error.message),
        onSuccess: async () => {
            toast.success('Program cloned to your custom programs.');
            await utilities.lifting.program.listMine.invalidate();
        },
    });

    const schedule = program.schedule;

    const liftSlugs = useMemo(() => {
        const lifts = new Set<string>();
        for (const w of schedule.weeks) {
            for (const d of w.days) {
                for (const slug of collectLiftsNeedingOneRm(d.blocks)) {
                    lifts.add(slug);
                }
            }
        }
        return [...lifts].toSorted((a, b) => a.localeCompare(b));
    }, [schedule]);

    const enrollForm = useForm<EnrollProgramInput>({
        defaultValues: {
            oneRepMaxes: Object.fromEntries(liftSlugs.map((k) => [k, 0])),
            programId: program.id,
            startDate: new Date().toISOString().slice(0, 10),
        },
        resolver: zodResolver(enrollProgramInputSchema),
    });

    const onEnroll = enrollForm.handleSubmit((values) => {
        enroll.mutate(values);
    });

    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
                    Enroll
                </CardTitle>
            </CardHeader>
            <CardContent>
                <Form {...enrollForm}>
                    <form className="flex flex-col gap-4" onSubmit={onEnroll}>
                        {liftSlugs.length === 0 ? (
                            <p className="text-sm text-muted-foreground">
                                This program doesn&apos;t require 1RM inputs.
                            </p>
                        ) : (
                            <div className="grid grid-cols-2 gap-3">
                                {liftSlugs.map((k) => (
                                    <FormField
                                        control={enrollForm.control}
                                        key={k}
                                        name={`oneRepMaxes.${k}` as const}
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel className="text-xs text-muted-foreground">
                                                    {k.replaceAll('-', ' ')} 1RM
                                                    ({unitWeight})
                                                </FormLabel>
                                                <FormControl>
                                                    <Input
                                                        inputMode="decimal"
                                                        max={1500}
                                                        min={0}
                                                        onChange={(event) => {
                                                            const raw =
                                                                event.target
                                                                    .value;
                                                            if (raw === '') {
                                                                field.onChange(
                                                                    0,
                                                                );
                                                                return;
                                                            }
                                                            const parsed =
                                                                Number(raw);
                                                            field.onChange(
                                                                Number.isFinite(
                                                                    parsed,
                                                                )
                                                                    ? WeightUnit.fromDisplay(
                                                                          parsed,
                                                                          unitWeight,
                                                                      )
                                                                    : 0,
                                                            );
                                                        }}
                                                        ref={field.ref}
                                                        step="0.5"
                                                        type="number"
                                                        value={
                                                            field.value
                                                                ? Number(
                                                                      WeightUnit.toDisplay(
                                                                          field.value,
                                                                          unitWeight,
                                                                      ).toFixed(
                                                                          1,
                                                                      ),
                                                                  )
                                                                : ''
                                                        }
                                                    />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                ))}
                            </div>
                        )}
                        <div className="flex flex-wrap gap-3">
                            <Button
                                className="gap-2"
                                disabled={enroll.isPending || isEnrolled}
                                type="submit"
                            >
                                {isEnrolled ? (
                                    <>
                                        <Check className="size-4" /> Enrolled to
                                        program
                                    </>
                                ) : (
                                    <>
                                        <Play className="size-4" />{' '}
                                        {enroll.isPending
                                            ? 'Enrolling…'
                                            : 'Enroll'}
                                    </>
                                )}
                            </Button>
                            <Button
                                className="gap-2"
                                disabled={clone.isPending || isCloned}
                                onClick={() => clone.mutate({ id: program.id })}
                                type="button"
                                variant="outline"
                            >
                                {isCloned ? (
                                    <>
                                        <Check className="size-4" /> Added to
                                        custom programs
                                    </>
                                ) : (
                                    <>
                                        <Copy className="size-4" />{' '}
                                        {clone.isPending
                                            ? 'Cloning…'
                                            : 'Clone to custom'}
                                    </>
                                )}
                            </Button>
                        </div>
                    </form>
                </Form>
            </CardContent>
        </Card>
    );
}

function collectLiftsNeedingOneRm(
    blocks: readonly ProgramBlock[],
): Set<string> {
    const lifts = new Set<string>();
    for (const block of blocks) {
        if (block.kind === 'superset') {
            for (const slug of collectLiftsNeedingOneRm(block.group)) {
                lifts.add(slug);
            }
            continue;
        }
        if (block.kind === 'emom') continue;
        if (block.kind === 'pyramid') {
            if (block.setSchemes.some((s) => s.pct1rm !== undefined)) {
                lifts.add(block.exerciseSlug);
            }
            continue;
        }
        if (block.kind === 'topset_backoff') {
            lifts.add(block.exerciseSlug);
            continue;
        }
        if (block.pct1rm !== undefined) lifts.add(block.exerciseSlug);
    }
    return lifts;
}
