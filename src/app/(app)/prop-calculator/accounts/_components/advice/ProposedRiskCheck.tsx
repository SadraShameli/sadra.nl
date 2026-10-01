'use client';

import { Lock } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '~/components/ui/Button';
import { Input } from '~/components/ui/Input';
import { Label } from '~/components/ui/Label';
import { errorMessage } from '~/lib/errorMessage';
import { formatCurrency } from '~/lib/format';
import { RuleViolationKind } from '~/lib/prop-accounts';
import { api } from '~/trpc/react';

import { type RiskCheckInputs, type RiskCheckView } from './riskCheckModel';

const FIELD_LABELS = {
    losses: 'Losses today',
    risk: 'Proposed risk ($)',
    wins: 'Wins today',
} as const satisfies Record<keyof RiskCheckInputs, string>;

export function ProposedRiskCheck({
    accountId,
    check,
    decisionId,
    inputMessage,
    inputs,
    notRunReason,
    occurredOn,
    onChange,
    recorded,
}: {
    readonly accountId: string;
    readonly check: null | RiskCheckView;
    readonly decisionId: null | string;
    readonly inputMessage: null | string;
    readonly inputs: RiskCheckInputs;
    readonly notRunReason: null | string;
    readonly occurredOn: string;
    readonly onChange: (inputs: RiskCheckInputs) => void;
    readonly recorded: null | {
        readonly risk: number;
        readonly view: RiskCheckView;
    };
}) {
    const utilities = api.useUtils();
    const create = api.propAccounts.violation.create.useMutation({
        onError: (error) => {
            toast.error(errorMessage(error));
        },
        onSuccess: () => {
            toast.success('Violation recorded');
            return utilities.propAccounts.invalidate();
        },
    });
    const logViolation = () => {
        create.mutate({
            accountId,
            costCents: null,
            decisionId,
            kind: RuleViolationKind.ForcedRecovery,
            note: null,
            occurredOn,
        });
    };

    return (
        <div className="flex flex-col gap-3">
            <div className="grid gap-3 sm:grid-cols-3">
                {(Object.keys(FIELD_LABELS) as (keyof RiskCheckInputs)[]).map(
                    (field) => (
                        <div className="flex flex-col gap-1" key={field}>
                            <Label htmlFor={`risk-check-${field}`}>
                                {FIELD_LABELS[field]}
                            </Label>
                            <Input
                                aria-label={FIELD_LABELS[field]}
                                id={`risk-check-${field}`}
                                inputMode="decimal"
                                onChange={(event) => {
                                    onChange({
                                        ...inputs,
                                        [field]: event.target.value,
                                    });
                                }}
                                value={inputs[field]}
                            />
                        </div>
                    ),
                )}
            </div>
            {inputMessage !== null && (
                <p className="text-sm text-destructive" role="alert">
                    {inputMessage}
                </p>
            )}
            {notRunReason !== null && (
                <p className="text-sm text-muted-foreground">{notRunReason}</p>
            )}
            {check !== null && (
                <VerdictBlock
                    isPending={create.isPending}
                    onLog={logViolation}
                    view={check}
                />
            )}
            {recorded !== null && (
                <div className="flex flex-col gap-1">
                    <p className="text-sm font-medium">
                        Recorded actual risk {formatCurrency(recorded.risk, 2)}
                    </p>
                    <VerdictBlock
                        isPending={create.isPending}
                        onLog={logViolation}
                        view={recorded.view}
                    />
                </div>
            )}
        </div>
    );
}

function VerdictBlock({
    isPending,
    onLog,
    view,
}: {
    readonly isPending: boolean;
    readonly onLog: () => void;
    readonly view: RiskCheckView;
}) {
    return (
        <div className="flex flex-col gap-2">
            <p className="flex items-center gap-2 text-sm" role="status">
                {view.stopText !== null && (
                    <Lock aria-hidden="true" className="size-4" />
                )}
                {view.verdictText}
            </p>
            {view.isViolationOffered && (
                <Button
                    className="self-start"
                    disabled={isPending}
                    onClick={onLog}
                    type="button"
                    variant="outline"
                >
                    Log violation
                </Button>
            )}
        </div>
    );
}
