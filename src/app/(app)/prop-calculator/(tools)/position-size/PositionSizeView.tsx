'use client';

import { useSearchParams } from 'next/navigation';
import { useMemo, useState } from 'react';

import FirmPlanPicker from '~/app/(app)/prop-calculator/_components/FirmPlanPicker';
import {
    formatPoints,
    fundedTierOptions,
    normalizePositionSizeInput,
    POSITION_SIZE_INSTRUMENTS,
    POSITION_SIZE_PHASE_LABELS,
    positionSizeFirm,
    positionSizeFor,
    type PositionSizeInput,
    positionSizePhases,
    type PositionSizeResult,
    positionSizeStatusText,
    siblingInstrumentSeverityText,
    siblingInstrumentText,
} from '~/app/(app)/prop-calculator/_components/positionSize/positionSizeModel';
import {
    decodePositionSize,
    encodePositionSize,
    parsePositionSizeInstrument,
    parsePositionSizePhase,
    parsePositionSizeRetryFee,
    parsePositionSizeRisk,
    parsePositionSizeRoom,
    parsePositionSizeStop,
    parsePositionSizeUnit,
    PositionSizeUrlParameter,
} from '~/app/(app)/prop-calculator/_components/positionSize/positionSizeUrlState';
import { formatRiskDisplay } from '~/app/(app)/prop-calculator/_components/riskDisplay';
import { ToolId } from '~/app/(app)/prop-calculator/_components/toolCatalog';
import { ToolPageHeading } from '~/app/(app)/prop-calculator/_components/ToolPageHeading';
import { useToolRulebook } from '~/app/(app)/prop-calculator/_components/useToolRulebook';
import { StatStrip } from '~/components/StatStrip';
import { ToolPanel } from '~/components/ToolPanel';
import {
    Field,
    FieldDescription,
    FieldError,
    FieldLabel,
} from '~/components/ui/field';
import { Input } from '~/components/ui/input';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '~/components/ui/select';
import { formatGateCurrency, NOT_APPLICABLE } from '~/lib/format';
import {
    ALL_FIRMS,
    dollars,
    serializePlanId,
    TradingPhase,
} from '~/lib/prop-calculator';
import { RiskDisplayUnit } from '~/lib/prop-calculator/advisor';
import { CALCULATOR_SCALAR_BOUNDS } from '~/lib/schemas/url';

const START_TIER = 'start';
const OPTIONAL_PLACEHOLDER = 'Optional, leave blank to skip';
const INPUTS_HEADING_ID = 'position-size-inputs-heading';
const RESULT_HEADING_ID = 'position-size-result-heading';
const FIX_FIELD_TEXT = 'Fix the highlighted field to see the position.';
const EV_AT_STAKE_NEEDS_ACCOUNT_TEXT =
    'EV at stake needs an account; see the account pages.';

type FieldValidityChange = (
    field: PositionSizeUrlParameter,
    isValid: boolean,
) => void;

interface NumberFieldProperties<T extends number> {
    field: PositionSizeUrlParameter;
    id: string;
    invalidText: string;
    label: string;
    onClear?: () => void;
    onValid: (value: T) => void;
    onValidityChange: FieldValidityChange;
    parse: (raw: string) => null | T;
    step: number;
    value: '' | T;
}

type PositionSizeChange = (patch: Partial<PositionSizeInput>) => void;

export function PositionSizeView() {
    const searchParameters = useSearchParams();
    const { userRulebook } = useToolRulebook();
    const savedUnit = userRulebook?.display.riskUnit ?? null;
    const [isUnitChosen, setIsUnitChosen] = useState(
        () =>
            parsePositionSizeUnit(
                searchParameters.get(PositionSizeUrlParameter.Unit) ?? '',
            ) !== null,
    );
    const [inputs, setInputs] = useState(() =>
        decodePositionSize(new URLSearchParams(searchParameters.toString())),
    );
    const state = useMemo(
        () => ({
            ...inputs,
            unit: isUnitChosen || savedUnit === null ? inputs.unit : savedUnit,
        }),
        [inputs, isUnitChosen, savedUnit],
    );
    const [invalidFields, setInvalidFields] = useState<
        ReadonlySet<PositionSizeUrlParameter>
    >(() => new Set());
    const result = useMemo(() => positionSizeFor(state), [state]);
    const activeInvalidFields = [...invalidFields].filter((field) =>
        isActiveField(field, state.phase),
    );
    const isInputValid = activeInvalidFields.length === 0;
    const omittedFromLink = [
        ...activeInvalidFields,
        ...(isUnitChosen ? [] : [PositionSizeUrlParameter.Unit]),
    ];
    const changeValidity: FieldValidityChange = (field, isValid) => {
        setInvalidFields((current) => {
            if (current.has(field) !== isValid) return current;
            const next = new Set(current);
            if (isValid) next.delete(field);
            else next.add(field);
            return next;
        });
    };
    const change: PositionSizeChange = (patch) => {
        if (patch.unit !== undefined) setIsUnitChosen(true);
        const isRetryFeeReset =
            patch.plan !== undefined && patch.retryFee === undefined;
        if (isRetryFeeReset) {
            changeValidity(PositionSizeUrlParameter.RetryFee, true);
        }
        setInputs((current) => {
            const withPlanRetryFee: Partial<PositionSizeInput> =
                isRetryFeeReset && patch.plan !== undefined
                    ? { ...patch, retryFee: dollars(patch.plan.retryFee()) }
                    : patch;
            return normalizePositionSizeInput({
                ...current,
                ...withPlanRetryFee,
            });
        });
    };

    return (
        <>
            <ToolPageHeading
                ownQuery={encodePositionSize(state, omittedFromLink)}
                toolId={ToolId.PositionSize}
            />
            <div className="app-prop-calculator__position-size mb-10 grid gap-8 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
                <section aria-labelledby={INPUTS_HEADING_ID}>
                    <ToolPanel title="Trade" titleId={INPUTS_HEADING_ID}>
                        <PositionSizeInputs
                            onChange={change}
                            onValidityChange={changeValidity}
                            state={state}
                        />
                    </ToolPanel>
                </section>
                <section aria-labelledby={RESULT_HEADING_ID}>
                    <ToolPanel title="Position" titleId={RESULT_HEADING_ID}>
                        <p className="sr-only" role="status">
                            {isInputValid
                                ? positionSizeStatusText(state, result)
                                : FIX_FIELD_TEXT}
                        </p>
                        {isInputValid ? (
                            <PositionSizeSummary
                                result={result}
                                state={state}
                            />
                        ) : (
                            <PositionSizeUnavailable />
                        )}
                    </ToolPanel>
                </section>
            </div>
        </>
    );
}

function isActiveField(
    field: PositionSizeUrlParameter,
    phase: TradingPhase,
): boolean {
    return (
        field !== PositionSizeUrlParameter.RetryFee ||
        phase === TradingPhase.Eval
    );
}

function NumberField<T extends number>({
    field,
    id,
    invalidText,
    label,
    onClear,
    onValid,
    onValidityChange,
    parse,
    step,
    value,
}: NumberFieldProperties<T>) {
    const [text, setText] = useState(() => String(value));
    const isBlank = onClear !== undefined && text.trim() === '';
    const isInvalid = !isBlank && parse(text) === null;
    const hintId = `${id}-hint`;
    return (
        <Field data-invalid={isInvalid}>
            <FieldLabel htmlFor={id}>{label}</FieldLabel>
            <Input
                aria-describedby={isInvalid ? hintId : undefined}
                aria-invalid={isInvalid}
                id={id}
                inputMode="decimal"
                onChange={(event) => {
                    setText(event.target.value);
                    if (
                        onClear !== undefined &&
                        event.target.value.trim() === ''
                    ) {
                        onValidityChange(field, true);
                        onClear();
                        return;
                    }
                    const parsed = parse(event.target.value);
                    onValidityChange(field, parsed !== null);
                    if (parsed !== null) onValid(parsed);
                }}
                placeholder={
                    onClear === undefined ? undefined : OPTIONAL_PLACEHOLDER
                }
                step={step}
                type="number"
                value={text}
            />
            {isInvalid ? (
                <FieldError id={hintId}>{invalidText}</FieldError>
            ) : null}
        </Field>
    );
}

function PositionSizeInputs({
    onChange,
    onValidityChange,
    state,
}: {
    onChange: PositionSizeChange;
    onValidityChange: FieldValidityChange;
    state: PositionSizeInput;
}) {
    const firm = positionSizeFirm(state.plan);
    const phases = positionSizePhases(state.plan);
    const tiers =
        state.phase === TradingPhase.Funded
            ? fundedTierOptions(state.plan, state.instrument)
            : [];
    return (
        <div className="flex flex-col gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
                <NumberField
                    field={PositionSizeUrlParameter.Risk}
                    id="position-size-risk"
                    invalidText="Enter a dollar risk above $0."
                    label="Risk per trade ($)"
                    onValid={(risk) => {
                        onChange({ risk });
                    }}
                    onValidityChange={onValidityChange}
                    parse={parsePositionSizeRisk}
                    step={1}
                    value={state.risk}
                />
                <NumberField
                    field={PositionSizeUrlParameter.Stop}
                    id="position-size-stop"
                    invalidText={`Enter a stop from ${CALCULATOR_SCALAR_BOUNDS.sp.min} to ${CALCULATOR_SCALAR_BOUNDS.sp.max.toLocaleString('en-US')} points.`}
                    label="Today's stop (points)"
                    onValid={(stopPoints) => {
                        onChange({ stopPoints });
                    }}
                    onValidityChange={onValidityChange}
                    parse={parsePositionSizeStop}
                    step={0.25}
                    value={state.stopPoints}
                />
            </div>
            <Field>
                <FieldLabel htmlFor="position-size-instrument">
                    Instrument
                </FieldLabel>
                <Select
                    onValueChange={(value) => {
                        const instrument = parsePositionSizeInstrument(value);
                        if (instrument !== null) onChange({ instrument });
                    }}
                    value={state.instrument}
                >
                    <SelectTrigger id="position-size-instrument">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {POSITION_SIZE_INSTRUMENTS.map((spec) => (
                            <SelectItem key={spec.symbol} value={spec.symbol}>
                                {spec.symbol}: {spec.label} (
                                {formatGateCurrency(spec.pointValue)} per point)
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </Field>
            {firm === undefined ? null : (
                <FirmPlanPicker
                    firm={firm}
                    firms={ALL_FIRMS}
                    onFirmChange={(next) => {
                        const [first] = next.plans;
                        if (first !== undefined) onChange({ plan: first });
                    }}
                    onPlanChange={(plan) => {
                        onChange({ plan });
                    }}
                    plan={state.plan}
                />
            )}
            <div className="grid gap-4 sm:grid-cols-2">
                <Field>
                    <FieldLabel htmlFor="position-size-phase">Phase</FieldLabel>
                    <Select
                        onValueChange={(value) => {
                            const phase = parsePositionSizePhase(value);
                            if (phase !== null) onChange({ phase });
                        }}
                        value={state.phase}
                    >
                        <SelectTrigger id="position-size-phase">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {phases.map((phase) => (
                                <SelectItem key={phase} value={phase}>
                                    {POSITION_SIZE_PHASE_LABELS[phase]}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    {phases.includes(TradingPhase.Eval) ? null : (
                        <FieldDescription>
                            Instant-funded plan: there is no eval phase.
                        </FieldDescription>
                    )}
                </Field>
                {tiers.length === 0 ? null : (
                    <Field>
                        <FieldLabel htmlFor="position-size-tier">
                            Funded contract tier
                        </FieldLabel>
                        <Select
                            onValueChange={(value) => {
                                onChange({
                                    tierProfit:
                                        value === START_TIER
                                            ? null
                                            : dollars(Number(value)),
                                });
                            }}
                            value={
                                state.tierProfit === null
                                    ? START_TIER
                                    : String(state.tierProfit)
                            }
                        >
                            <SelectTrigger id="position-size-tier">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value={START_TIER}>
                                    Funded start
                                </SelectItem>
                                {tiers.map((tierProfit) => (
                                    <SelectItem
                                        key={tierProfit}
                                        value={String(tierProfit)}
                                    >
                                        From {formatGateCurrency(tierProfit)}{' '}
                                        profit
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </Field>
                )}
            </div>
            <NumberField
                field={PositionSizeUrlParameter.Room}
                id="position-size-room"
                invalidText="Enter a room of $0 or more, or leave it blank."
                label="Room left today (cushion or daily loss limit)"
                onClear={() => {
                    onChange({ roomDollars: null });
                }}
                onValid={(roomDollars) => {
                    onChange({ roomDollars });
                }}
                onValidityChange={onValidityChange}
                parse={parsePositionSizeRoom}
                step={1}
                value={state.roomDollars ?? ''}
            />
            <div className="grid gap-4 sm:grid-cols-2">
                {state.phase === TradingPhase.Eval ? (
                    <NumberField
                        field={PositionSizeUrlParameter.RetryFee}
                        id="position-size-retry-fee"
                        invalidText="Enter a retry fee of $0 or more."
                        key={serializePlanId(state.plan.id)}
                        label="Retry fee ($)"
                        onValid={(retryFee) => {
                            onChange({ retryFee });
                        }}
                        onValidityChange={onValidityChange}
                        parse={parsePositionSizeRetryFee}
                        step={1}
                        value={state.retryFee}
                    />
                ) : null}
                <Field>
                    <FieldLabel htmlFor="position-size-unit">
                        Risk shown as
                    </FieldLabel>
                    <Select
                        onValueChange={(value) => {
                            const unit = parsePositionSizeUnit(value);
                            if (unit !== null) onChange({ unit });
                        }}
                        value={state.unit}
                    >
                        <SelectTrigger id="position-size-unit">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {Object.values(RiskDisplayUnit).map((unit) => (
                                <SelectItem key={unit} value={unit}>
                                    {riskDisplayUnitLabel(unit)}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </Field>
            </div>
        </div>
    );
}

function PositionSizeSummary({
    result,
    state,
}: {
    result: PositionSizeResult;
    state: PositionSizeInput;
}) {
    const { symbol } = result.positionSizing.instrument;
    const stop = result.exactRiskStop;
    return (
        <div className="flex flex-col gap-4">
            <StatStrip
                items={[
                    {
                        caption: `at a ${formatPoints(state.stopPoints)} point stop; one contract risks ${result.oneContractRiskText}`,
                        id: 'contracts',
                        label: 'Contracts',
                        value: `${result.contracts} ${symbol}`,
                    },
                    {
                        caption:
                            result.placedRisk === null
                                ? 'the contract limit binds: see the stop'
                                : `${formatGateCurrency(result.placedRisk)} placed at your stop`,
                        id: 'leftover',
                        label: 'Leftover',
                        value:
                            result.leftover === null
                                ? NOT_APPLICABLE
                                : formatGateCurrency(result.leftover),
                    },
                    {
                        caption:
                            stop === null
                                ? 'no whole contract fits'
                                : `risks ${formatGateCurrency(stop.riskAtTickStop)} on ${result.contracts} ${symbol}`,
                        id: 'exact-risk-stop',
                        label: 'Stop for the exact risk',
                        value:
                            stop === null
                                ? NOT_APPLICABLE
                                : `${formatPoints(stop.tickPoints)} pts`,
                    },
                    {
                        caption:
                            result.minStopAtCap === null
                                ? 'none modeled for this plan and phase'
                                : `the limit stops binding at a stop of at least ${formatPoints(result.minStopAtCap)} pts`,
                        id: 'contract-limit',
                        label: `${POSITION_SIZE_PHASE_LABELS[state.phase]} contract limit`,
                        value:
                            result.cap === null
                                ? NOT_APPLICABLE
                                : `${result.cap} ${symbol}`,
                    },
                    {
                        caption: result.riskDisplay.label,
                        id: 'risk-display',
                        label: 'Risk, shown as',
                        value: result.riskDisplay.text,
                    },
                ]}
            />
            {result.riskDisplay.disclosure === null ? null : (
                <p className="text-sm text-muted-foreground">
                    Fee equivalent: {result.riskDisplay.disclosure}.
                </p>
            )}
            {result.riskDisplay.isFallback ? (
                <p className="text-sm text-muted-foreground">
                    {EV_AT_STAKE_NEEDS_ACCOUNT_TEXT}
                </p>
            ) : null}
            {result.refusal === null ? null : (
                <p className="text-sm text-warning">{result.refusal}</p>
            )}
            {result.atRiskIfBustedText === null ? null : (
                <p className="text-sm text-muted-foreground">
                    {result.atRiskIfBustedText}
                </p>
            )}
            {siblingInstrumentText(result) === null ? null : (
                <p className="text-sm text-muted-foreground">
                    {siblingInstrumentText(result)}{' '}
                    {siblingInstrumentSeverityText(result)}
                </p>
            )}
            {result.notes.map((note) => (
                <p className="text-sm text-muted-foreground" key={note}>
                    {note}
                </p>
            ))}
        </div>
    );
}

function PositionSizeUnavailable() {
    return (
        <div className="flex flex-col gap-4">
            <StatStrip
                items={[
                    {
                        id: 'contracts',
                        label: 'Contracts',
                        value: NOT_APPLICABLE,
                    },
                    {
                        id: 'leftover',
                        label: 'Leftover',
                        value: NOT_APPLICABLE,
                    },
                    {
                        id: 'exact-risk-stop',
                        label: 'Stop for the exact risk',
                        value: NOT_APPLICABLE,
                    },
                    {
                        id: 'contract-limit',
                        label: 'Contract limit',
                        value: NOT_APPLICABLE,
                    },
                ]}
            />
            <p className="text-sm text-warning">{FIX_FIELD_TEXT}</p>
        </div>
    );
}

function riskDisplayUnitLabel(unit: RiskDisplayUnit): string {
    return formatRiskDisplay(unit, {
        accountDollars: 0,
        evAtStake: 0,
        feeEquivalent: 0,
    }).label;
}
