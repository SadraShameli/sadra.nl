'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useId } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { Button } from '~/components/ui/button';
import {
    Field,
    FieldDescription,
    FieldError,
    FieldLabel,
} from '~/components/ui/field';
import { Input } from '~/components/ui/input';
import {
    DEFAULT_HERO_SHOWCASE,
    type HeroShowcaseInput,
    heroShowcaseInputSchema,
} from '~/lib/site/HeroShowcase';
import { api } from '~/trpc/react';

const FIELDS = [
    {
        help: 'The big figure on the homepage P&L card. Negative for a loss.',
        label: 'Today’s P&L ($)',
        name: 'todayProfitAndLossDollars',
        step: '0.01',
    },
    {
        help: 'The amount on the homepage payout card.',
        label: 'Total payouts ($)',
        name: 'totalPayoutDollars',
        step: '0.01',
    },
    {
        help: 'Whole percent, 0 to 100.',
        label: 'Win rate (%)',
        name: 'winRatePercent',
        step: '1',
    },
    {
        help: 'Average reward to risk per trade.',
        label: 'Average R',
        name: 'averageR',
        step: '0.01',
    },
] as const;

export function HeroShowcaseForm({
    initial,
}: {
    readonly initial: HeroShowcaseInput | null;
}) {
    const formId = useId();
    const update = api.site.updateHeroShowcase.useMutation({
        onError: (error) => toast.error(error.message),
        onSuccess: () => toast.success('Homepage figures saved'),
    });
    const form = useForm<HeroShowcaseInput>({
        defaultValues: initial ?? DEFAULT_HERO_SHOWCASE,
        resolver: zodResolver(heroShowcaseInputSchema),
    });

    return (
        <form
            className="flex flex-col gap-6"
            id={formId}
            onSubmit={form.handleSubmit((values) => update.mutate(values))}
        >
            <div className="grid gap-x-6 gap-y-5 sm:grid-cols-2">
                {FIELDS.map((field) => {
                    const inputId = `${formId}-${field.name}`;
                    const noteId = `${inputId}-note`;
                    const error = form.formState.errors[field.name];
                    return (
                        <Field
                            data-invalid={error !== undefined}
                            key={field.name}
                        >
                            <FieldLabel htmlFor={inputId}>
                                {field.label}
                            </FieldLabel>
                            <Input
                                aria-describedby={noteId}
                                aria-invalid={error !== undefined}
                                className="tabular-nums"
                                id={inputId}
                                inputMode="decimal"
                                step={field.step}
                                type="number"
                                {...form.register(field.name, {
                                    valueAsNumber: true,
                                })}
                            />
                            {error === undefined ? (
                                <FieldDescription id={noteId}>
                                    {field.help}
                                </FieldDescription>
                            ) : (
                                <FieldError id={noteId}>
                                    {error.message}
                                </FieldError>
                            )}
                        </Field>
                    );
                })}
            </div>
            <Button
                className="self-start"
                disabled={update.isPending}
                type="submit"
            >
                Save figures
            </Button>
        </form>
    );
}
