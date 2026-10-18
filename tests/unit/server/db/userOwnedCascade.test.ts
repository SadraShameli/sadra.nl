import { is } from 'drizzle-orm';
import { getTableConfig, PgTable } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';

import { databaseSchema } from '~/server/db/databaseSchema';
import { user } from '~/server/db/schemas/auth';

const OWNER_COLUMNS: ReadonlySet<string> = new Set(['owner_id', 'user_id']);

const tables: PgTable[] = [];
for (const value of Object.values(databaseSchema)) {
    if (value !== user && is(value, PgTable)) tables.push(value);
}

function ownerColumnsWithoutCascade(): string[] {
    return tables.flatMap((table) => {
        const config = getTableConfig(table);
        const cascading = new Set(
            config.foreignKeys
                .filter(
                    (foreignKey) =>
                        foreignKey.reference().foreignTable === user &&
                        foreignKey.onDelete === 'cascade',
                )
                .flatMap((foreignKey) =>
                    foreignKey.reference().columns.map((column) => column.name),
                ),
        );
        return config.columns
            .filter(
                (column) =>
                    OWNER_COLUMNS.has(column.name) &&
                    !cascading.has(column.name),
            )
            .map((column) => `${config.name}.${column.name}`);
    });
}

describe('user-owned rows', () => {
    it('cascade from the user so deleting an account removes all of its data', () => {
        expect(ownerColumnsWithoutCascade()).toEqual([]);
    });
});
