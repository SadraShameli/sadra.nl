'use client';

import { LiftingSettingsForm } from '~/app/(app)/profile/_components/LiftingSettingsForm';
import { type PageTab, PageTabs } from '~/components/PageTabs';
import { type RouterOutputs } from '~/trpc/react';

import { ExercisesManager } from './ExercisesManager';
import { ProgramsManager } from './ProgramsManager';
import { WorkoutsManager } from './WorkoutsManager';

type Settings = RouterOutputs['lifting']['settings']['get'];

const LiftingTab = {
    Exercises: 'exercises',
    Programs: 'programs',
    Settings: 'settings',
    Workouts: 'workouts',
} as const;

type LiftingTab = (typeof LiftingTab)[keyof typeof LiftingTab];

export function LiftingHub({ initialSettings }: { initialSettings: Settings }) {
    const tabs: readonly PageTab<LiftingTab>[] = [
        {
            content: <LiftingSettingsForm initial={initialSettings} />,
            label: 'Settings',
            value: LiftingTab.Settings,
        },
        {
            content: <ExercisesManager />,
            label: 'Exercises',
            value: LiftingTab.Exercises,
        },
        {
            content: <ProgramsManager />,
            label: 'Programs',
            value: LiftingTab.Programs,
        },
        {
            content: <WorkoutsManager />,
            label: 'Workouts',
            value: LiftingTab.Workouts,
        },
    ];
    return <PageTabs defaultValue={LiftingTab.Settings} tabs={tabs} />;
}
