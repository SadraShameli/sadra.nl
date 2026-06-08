import { OFFICIAL_PROGRAMS } from '~/lib/lifting/programs/official';
import { db } from '~/server/db';
import { liftingProgram } from '~/server/db/schemas/lifting';
import { DatabaseSeeder } from '~/server/db/types';

export class SeedLiftingPrograms extends DatabaseSeeder {
    readonly name = 'lifting:programs';
    override readonly priority = 20;

    async run(): Promise<void> {
        for (const program of OFFICIAL_PROGRAMS) {
            await db
                .insert(liftingProgram)
                .values({
                    category: program.category,
                    daysPerWeek: program.daysPerWeek,
                    description: program.description,
                    isOfficial: true,
                    isPublic: true,
                    lengthWeeks: program.lengthWeeks,
                    name: program.name,
                    ownerId: null,
                    schedule: program.schedule,
                    slug: program.slug,
                })
                .onConflictDoNothing();
        }
    }
}
