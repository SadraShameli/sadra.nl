'use client';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '~/components/ui/Tabs';
import { type RouterOutputs } from '~/trpc/react';

import { LiftingSettingsForm } from '../LiftingSettingsForm';
import { ExercisesManager } from './ExercisesManager';
import { ProgramsManager } from './ProgramsManager';
import { WorkoutsManager } from './WorkoutsManager';

type Settings = RouterOutputs['lifting']['settings']['get'];

export function LiftingHub({ initialSettings }: { initialSettings: Settings }) {
    return (
        <Tabs className="flex flex-col gap-6" defaultValue="settings">
            <TabsList className="w-fit self-start">
                <TabsTrigger value="settings">Settings</TabsTrigger>
                <TabsTrigger value="exercises">Exercises</TabsTrigger>
                <TabsTrigger value="programs">Programs</TabsTrigger>
                <TabsTrigger value="workouts">Workouts</TabsTrigger>
            </TabsList>

            <TabsContent value="settings">
                <LiftingSettingsForm initial={initialSettings} />
            </TabsContent>
            <TabsContent value="exercises">
                <ExercisesManager />
            </TabsContent>
            <TabsContent value="programs">
                <ProgramsManager />
            </TabsContent>
            <TabsContent value="workouts">
                <WorkoutsManager />
            </TabsContent>
        </Tabs>
    );
}
