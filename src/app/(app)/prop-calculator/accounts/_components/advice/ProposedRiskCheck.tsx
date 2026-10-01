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

import {
    hasViolationForDecision,
    type RecordedRiskCheck,
    type RiskCheckInputs,
    type RiskCheckView,
} from './riskCheckModel';

const VIOLATION_KIND = RuleViolationKind.ForcedRecovery;

const FIELD_LABELS = {
    losses: 'Losses today',
    risk: 'Proposed risk ($)',
    wins: 'Wins today',
} as const satisfies Record<keyof RiskCheckInputs, string>;

export function ProposedRiskCheck({
    accountId,
    check,
    inputMessage,
    inputs,
    notRunReason,
    occurredOn,
    onChange,
    recorded,
}: {
    readonly accountId: string;
    readonly check: null | RiskCheckView;
    readonly inputMessage: null | string;
    readonly inputs: RiskCheckInputs;
    readonly notRunReason: null | string;
    readonly occurredOn: string;
    readonly onChange: (inputs: RiskCheckInputs) => void;
    readonly recorded: null | RecordedRiskCheck;
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
    const violations = api.propAccounts.violation.list.useQuery({ accountId });
    const loggedDecisionId = create.isSuccess
        ? create.variables.decisionId
        : null;
    const logViolation = (decisionId: string) => {
        create.mutate({
            accountId,
            costCents: null,
            decisionId,
            kind: VIOLATION_KIND,
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
            {check !== null && <VerdictBlock view={check} violation={null} />}
            {recorded !== null && (
                <div className="flex flex-col gap-1">
                    <p className="text-sm font-medium">
                        Recorded actual risk {formatCurrency(recorded.risk, 2)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                        {recorded.basisText}
                    </p>
                    <VerdictBlock
                        view={recorded.view}
                        violation={{
                            isLogged:
                                loggedDecisionId === recorded.decisionId ||
                                hasViolationForDecision(
                                    violations.data ?? [],
                                    recorded.decisionId,
                                    VIOLATION_KIND,
                                ),
                            isPending: create.isPending || violations.isPending,
                            onLog: () => {
                                logViolation(recorded.decisionId);
                            },
                        }}
                    />
                </div>
            )}
        </div>
    );
}

function VerdictBlock({
    view,
    violation,
}: {
    readonly view: RiskCheckView;
    readonly violation: null | {
        readonly isLogged: boolean;
        readonly isPending: boolean;
        readonly onLog: () => void;
    };
}) {
    return (
        <div className="flex flex-col gap-2">
            <p className="flex items-center gap-2 text-sm" role="status">
                {view.stopText !== null && (
                    <Lock aria-hidden="true" className="size-4" />
                )}
                {view.verdictText}
            </p>
            {violation !== null && view.isViolationOffered && (
                <ViolationControl violation={violation} />
            )}
        </div>
    );
}

function ViolationControl({
    violation,
}: {
    readonly violation: {
        readonly isLogged: boolean;
        readonly isPending: boolean;
        readonly onLog: () => void;
    };
}) {
    if (violation.isLogged) {
        return (
            <p className="text-sm text-muted-foreground">Violation recorded</p>
        );
    }
    return (
        <Button
            className="self-start"
            disabled={violation.isPending}
            onClick={violation.onLog}
            type="button"
            variant="outline"
        >
            Log violation
        </Button>
    );
}
