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
    parsePositionSizeStop,
    parsePositionSizeUnit,
    PositionSizeUrlParameter,
} from '~/app/(app)/prop-calculator/_components/positionSize/positionSizeUrlState';
import { formatRiskDisplay } from '~/app/(app)/prop-calculator/_components/riskDisplay';
import StatCard from '~/app/(app)/prop-calculator/_components/StatCard';
import { ToolId } from '~/app/(app)/prop-calculator/_components/toolCatalog';
import { ToolPageHeading } from '~/app/(app)/prop-calculator/_components/ToolPageHeading';
import { Input } from '~/components/ui/Input';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '~/components/ui/Select';
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
const LABEL_CLASS = 'text-xs font-medium text-muted-foreground';
const INPUTS_HEADING_ID = 'position-size-inputs-heading';
const RESULT_HEADING_ID = 'position-size-result-heading';
const FIX_FIELD_TEXT = 'Fix the highlighted field to see the position.';

type FieldValidityChange = (
    field: PositionSizeUrlParameter,
    isValid: boolean,
) => void;

interface NumberFieldProperties<T extends number> {
    field: PositionSizeUrlParameter;
    id: string;
    invalidText: string;
    label: string;
    onValid: (value: T) => void;
    onValidityChange: FieldValidityChange;
    parse: (raw: string) => null | T;
    step: number;
    value: T;
}

type PositionSizeChange = (patch: Partial<PositionSizeInput>) => void;

export function PositionSizeView() {
    const searchParameters = useSearchParams();
    const [state, setState] = useState(() =>
        decodePositionSize(new URLSearchParams(searchParameters.toString())),
    );
    const [invalidFields, setInvalidFields] = useState<
        ReadonlySet<PositionSizeUrlParameter>
    >(() => new Set());
    const result = useMemo(() => positionSizeFor(state), [state]);
    const isInputValid = invalidFields.size === 0;
    const change: PositionSizeChange = (patch) => {
        setState((current) => {
            const withPlanRetryFee: Partial<PositionSizeInput> =
                patch.plan !== undefined && patch.retryFee === undefined
                    ? { ...patch, retryFee: dollars(patch.plan.retryFee()) }
                    : patch;
            return normalizePositionSizeInput({
                ...current,
                ...withPlanRetryFee,
            });
        });
    };
    const changeValidity: FieldValidityChange = (field, isValid) => {
        setInvalidFields((current) => {
            if (current.has(field) !== isValid) return current;
            const next = new Set(current);
            if (isValid) next.delete(field);
            else next.add(field);
            return next;
        });
    };

    return (
        <>
            <ToolPageHeading
                ownQuery={encodePositionSize(state, [...invalidFields])}
                toolId={ToolId.PositionSize}
            />
            <div className="app-prop-calculator__position-size mb-10 grid gap-8 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
                <section
                    aria-labelledby={INPUTS_HEADING_ID}
                    className="flex flex-col gap-4"
                >
                    <h2
                        className="text-lg font-semibold tracking-tight text-white"
                        id={INPUTS_HEADING_ID}
                    >
                        Trade
                    </h2>
                    <PositionSizeInputs
                        onChange={change}
                        onValidityChange={changeValidity}
                        state={state}
                    />
                </section>
                <section
                    aria-labelledby={RESULT_HEADING_ID}
                    className="flex flex-col gap-4"
                >
                    <h2
                        className="text-lg font-semibold tracking-tight text-white"
                        id={RESULT_HEADING_ID}
                    >
                        Position
                    </h2>
                    <p className="sr-only" role="status">
                        {isInputValid
                            ? positionSizeStatusText(state, result)
                            : FIX_FIELD_TEXT}
                    </p>
                    {isInputValid ? (
                        <PositionSizeSummary result={result} state={state} />
                    ) : (
                        <PositionSizeUnavailable />
                    )}
                </section>
            </div>
        </>
    );
}

function NumberField<T extends number>({
    field,
    id,
    invalidText,
    label,
    onValid,
    onValidityChange,
    parse,
    step,
    value,
}: NumberFieldProperties<T>) {
    const [text, setText] = useState(() => String(value));
    const isInvalid = parse(text) === null;
    const hintId = `${id}-hint`;
    return (
        <div className="flex flex-col gap-1">
            <label className={LABEL_CLASS} htmlFor={id}>
                {label}
            </label>
            <Input
                aria-describedby={isInvalid ? hintId : undefined}
                aria-invalid={isInvalid}
                id={id}
                inputMode="decimal"
                onChange={(event) => {
                    setText(event.target.value);
                    const parsed = parse(event.target.value);
                    onValidityChange(field, parsed !== null);
                    if (parsed !== null) onValid(parsed);
                }}
                step={step}
                type="number"
                value={text}
            />
            {isInvalid ? (
                <p className="text-xs text-amber-400" id={hintId}>
                    {invalidText}
                </p>
            ) : null}
        </div>
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
            <div className="flex flex-col gap-1">
                <label
                    className={LABEL_CLASS}
                    htmlFor="position-size-instrument"
                >
                    Instrument
                </label>
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
            </div>
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
                <div className="flex flex-col gap-1">
                    <label
                        className={LABEL_CLASS}
                        htmlFor="position-size-phase"
                    >
                        Phase
                    </label>
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
                        <p className="text-xs text-muted-foreground">
                            Instant-funded plan: there is no eval phase.
                        </p>
                    )}
                </div>
                {tiers.length === 0 ? null : (
                    <div className="flex flex-col gap-1">
                        <label
                            className={LABEL_CLASS}
                            htmlFor="position-size-tier"
                        >
                            Funded contract tier
                        </label>
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
                    </div>
                )}
            </div>
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
                <div className="flex flex-col gap-1">
                    <label className={LABEL_CLASS} htmlFor="position-size-unit">
                        Risk shown as
                    </label>
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
                </div>
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
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <StatCard
                    label="Contracts"
                    sub={`at a ${formatPoints(state.stopPoints)} point stop; one contract risks ${result.oneContractRiskText}`}
                    value={`${result.contracts} ${symbol}`}
                />
                <StatCard
                    label="Leftover"
                    sub={
                        result.placedRisk === null
                            ? 'the contract limit binds: see the stop'
                            : `${formatGateCurrency(result.placedRisk)} placed at your stop`
                    }
                    value={
                        result.leftover === null
                            ? NOT_APPLICABLE
                            : formatGateCurrency(result.leftover)
                    }
                />
                <StatCard
                    label="Stop for the exact risk"
                    sub={
                        stop === null
                            ? 'no whole contract fits'
                            : `risks ${formatGateCurrency(stop.riskAtTickStop)} on ${result.contracts} ${symbol}`
                    }
                    value={
                        stop === null
                            ? NOT_APPLICABLE
                            : `${formatPoints(stop.tickPoints)} pts`
                    }
                />
                <StatCard
                    label={`${POSITION_SIZE_PHASE_LABELS[state.phase]} contract limit`}
                    sub={
                        result.minStopAtCap === null
                            ? 'none modeled for this plan and phase'
                            : `the limit stops binding at a stop of at least ${formatPoints(result.minStopAtCap)} pts`
                    }
                    value={
                        result.cap === null
                            ? NOT_APPLICABLE
                            : `${result.cap} ${symbol}`
                    }
                />
                <StatCard
                    label="Risk, shown as"
                    sub={result.riskDisplay.label}
                    value={result.riskDisplay.text}
                />
            </div>
            {result.refusal === null ? null : (
                <p className="text-sm text-amber-400">{result.refusal}</p>
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
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <StatCard label="Contracts" value={NOT_APPLICABLE} />
                <StatCard label="Leftover" value={NOT_APPLICABLE} />
                <StatCard
                    label="Stop for the exact risk"
                    value={NOT_APPLICABLE}
                />
                <StatCard label="Contract limit" value={NOT_APPLICABLE} />
            </div>
            <p className="text-sm text-amber-400">{FIX_FIELD_TEXT}</p>
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
