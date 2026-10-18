'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, useWatch } from 'react-hook-form';

import { FormDialog } from '~/components/FormDialog';
import {
    FormControlField,
    FormNumberField,
    FormSelectField,
    type FormSelectOption,
    FormTextField,
} from '~/components/FormFields';
import {
    ALL_INSTRUMENTS,
    CorrelationMode,
    type InstrumentSymbol,
} from '~/lib/prop-calculator';
import {
    CALCULATOR_SCALAR_BOUNDS,
    LAB_SCENARIO_BOUNDS,
    labScenarioSchema,
} from '~/lib/schemas/url';

import DayStopRulePicker from './DayStopRulePicker';
import { type LabScenario } from './types';

export const CORRELATION_LABEL: Readonly<Record<CorrelationMode, string>> = {
    [CorrelationMode.Copy]: 'Copy-trade',
    [CorrelationMode.Grouped]: 'Group-split',
    [CorrelationMode.Independent]: 'Independent',
};

enum LabEditorField {
    Accounts = 'accounts',
    DayStop = 'dayStop',
    Groups = 'groups',
    Instrument = 'instrument',
    Label = 'label',
    Mode = 'mode',
    RewardToRisk = 'rewardToRisk',
    RiskPerTrade = 'riskPerTrade',
    StopPoints = 'stopPoints',
    TradesPerDay = 'tradesPerDay',
    WinRate = 'winRate',
}

const LAB_EDITOR_FIELD_LABEL: Readonly<Record<LabEditorField, string>> = {
    [LabEditorField.Accounts]: 'Accounts',
    [LabEditorField.DayStop]: 'Day stop rule',
    [LabEditorField.Groups]: 'Groups',
    [LabEditorField.Instrument]: 'Instrument',
    [LabEditorField.Label]: 'Scenario name',
    [LabEditorField.Mode]: 'Mode',
    [LabEditorField.RewardToRisk]: 'Reward to risk',
    [LabEditorField.RiskPerTrade]: 'Risk per trade ($)',
    [LabEditorField.StopPoints]: 'Stop (points)',
    [LabEditorField.TradesPerDay]: 'Trades per day',
    [LabEditorField.WinRate]: 'Win rate (%)',
};

const PERCENT = 100;
const NOT_ENFORCED_KEY = 'not-enforced';
const WINRATE_BOUNDS = CALCULATOR_SCALAR_BOUNDS.wr;
const RR_BOUNDS = CALCULATOR_SCALAR_BOUNDS.rr;
const TRADES_PER_DAY_BOUNDS = CALCULATOR_SCALAR_BOUNDS.tpd;
const STOP_POINTS_BOUNDS = CALCULATOR_SCALAR_BOUNDS.sp;
const ACCOUNTS_BOUNDS = LAB_SCENARIO_BOUNDS.accounts;
const RISK_BOUNDS = LAB_SCENARIO_BOUNDS.riskPerTrade;

const INSTRUMENT_OPTIONS: readonly FormSelectOption<InstrumentSymbol | null>[] =
    [
        { label: 'Not enforced', value: null },
        ...ALL_INSTRUMENTS.map((spec) => ({
            label: spec.symbol,
            value: spec.symbol,
        })),
    ];

const CORRELATION_OPTIONS: readonly FormSelectOption<CorrelationMode>[] =
    Object.values(CorrelationMode).map((mode) => ({
        label: CORRELATION_LABEL[mode],
        value: mode,
    }));

export function LabScenarioDialog({
    initial,
    onCancel,
    onSubmit,
    submitLabel,
    title,
}: {
    initial: LabScenario;
    onCancel: () => void;
    onSubmit: (scenario: LabScenario) => void;
    submitLabel: string;
    title: string;
}) {
    const form = useForm({
        defaultValues: initial,
        resolver: zodResolver(labScenarioSchema),
    });
    const [accounts, correlation, instrument] = useWatch({
        control: form.control,
        name: ['accounts', 'correlation', 'instrument'],
    });
    return (
        <FormDialog
            form={form}
            onCancel={onCancel}
            onSubmit={onSubmit}
            pending={false}
            submitLabel={submitLabel}
            title={title}
        >
            <FormTextField
                control={form.control}
                label={LAB_EDITOR_FIELD_LABEL[LabEditorField.Label]}
                name="label"
            />
            <div className="grid gap-4 md:grid-cols-2">
                <FormNumberField
                    control={form.control}
                    label={LAB_EDITOR_FIELD_LABEL[LabEditorField.RiskPerTrade]}
                    max={RISK_BOUNDS.max}
                    min={RISK_BOUNDS.min}
                    name="riskPerTrade"
                />
                <FormNumberField
                    control={form.control}
                    label={LAB_EDITOR_FIELD_LABEL[LabEditorField.WinRate]}
                    max={Math.round(WINRATE_BOUNDS.max * PERCENT)}
                    min={Math.round(WINRATE_BOUNDS.min * PERCENT)}
                    name="winrate"
                    scale={PERCENT}
                />
                <FormNumberField
                    control={form.control}
                    label={LAB_EDITOR_FIELD_LABEL[LabEditorField.RewardToRisk]}
                    max={RR_BOUNDS.max}
                    min={RR_BOUNDS.min}
                    name="rrRatio"
                />
                <FormNumberField
                    control={form.control}
                    isInteger
                    label={LAB_EDITOR_FIELD_LABEL[LabEditorField.TradesPerDay]}
                    max={TRADES_PER_DAY_BOUNDS.max}
                    min={TRADES_PER_DAY_BOUNDS.min}
                    name="tradesPerDay"
                />
                <FormSelectField
                    control={form.control}
                    keyOf={(value) => value ?? NOT_ENFORCED_KEY}
                    label={LAB_EDITOR_FIELD_LABEL[LabEditorField.Instrument]}
                    name="instrument"
                    onValueChange={(value) => {
                        if (value === null) {
                            form.setValue('stopPoints', null);
                            return;
                        }
                        if (form.getValues('stopPoints') === null) {
                            form.setValue('stopPoints', NaN);
                        }
                    }}
                    options={INSTRUMENT_OPTIONS}
                />
                <FormNumberField
                    control={form.control}
                    isDisabled={instrument === null}
                    label={LAB_EDITOR_FIELD_LABEL[LabEditorField.StopPoints]}
                    max={STOP_POINTS_BOUNDS.max}
                    min={STOP_POINTS_BOUNDS.min}
                    name="stopPoints"
                />
                <FormNumberField
                    control={form.control}
                    isInteger
                    label={LAB_EDITOR_FIELD_LABEL[LabEditorField.Accounts]}
                    max={ACCOUNTS_BOUNDS.max}
                    min={ACCOUNTS_BOUNDS.min}
                    name="accounts"
                    onValueChange={(value) => {
                        if (
                            Number.isSafeInteger(value) &&
                            value >= ACCOUNTS_BOUNDS.min &&
                            value <= ACCOUNTS_BOUNDS.max &&
                            form.getValues('groups') > value
                        ) {
                            form.setValue('groups', value);
                        }
                    }}
                />
                <FormSelectField
                    control={form.control}
                    keyOf={(value) => value}
                    label={LAB_EDITOR_FIELD_LABEL[LabEditorField.Mode]}
                    name="correlation"
                    options={CORRELATION_OPTIONS}
                />
                <FormNumberField
                    control={form.control}
                    isDisabled={correlation !== CorrelationMode.Grouped}
                    isInteger
                    label={LAB_EDITOR_FIELD_LABEL[LabEditorField.Groups]}
                    max={accounts}
                    min={1}
                    name="groups"
                />
            </div>
            <FormControlField
                control={form.control}
                label={LAB_EDITOR_FIELD_LABEL[LabEditorField.DayStop]}
                name="dayStop"
            >
                {({ field, id }) => (
                    <DayStopRulePicker
                        id={id}
                        onChange={field.onChange}
                        value={field.value}
                    />
                )}
            </FormControlField>
        </FormDialog>
    );
}
