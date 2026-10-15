import type { ProgramSchedule } from '~/lib/lifting/types';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '~/components/ui/Tabs';

import { ProgramDayCard } from './ProgramDayCard';

export function ProgramScheduleTabs({
    schedule,
}: {
    readonly schedule: ProgramSchedule;
}) {
    return (
        <Tabs className="flex flex-col gap-4" defaultValue="week-1">
            <div className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
                <TabsList className="w-max">
                    {schedule.weeks.map((week, index) => (
                        <TabsTrigger
                            key={index}
                            value={`week-${String(index + 1)}`}
                        >
                            {week.name ?? `Week ${String(index + 1)}`}
                        </TabsTrigger>
                    ))}
                </TabsList>
            </div>
            {schedule.weeks.map((week, weekIndex) => (
                <TabsContent
                    key={weekIndex}
                    value={`week-${String(weekIndex + 1)}`}
                >
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                        {week.days.map((day, index) => (
                            <ProgramDayCard
                                day={day}
                                dayNumber={index + 1}
                                key={`${String(index)}-${day.name}`}
                            />
                        ))}
                    </div>
                </TabsContent>
            ))}
        </Tabs>
    );
}
