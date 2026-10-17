import { getTableColumns, getTableName, is } from 'drizzle-orm';
import { PgTable } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';

import * as liftingSchema from '~/server/db/schemas/lifting';
import * as tradingSchema from '~/server/db/schemas/trading';
import { deleteUserOwnedData } from '~/server/helpers/UserOwnedData';

import {
    createFakeDatabase,
    type IssuedQuery,
    TransactionStep,
    transactionSteps,
    writeTable,
} from '../fakeDatabase';

const USER_ID = 'user-being-deleted';
const OWNER_COLUMN = /"(?:user_id|owner_id)" = \$(\d+)/;

const OWNED_TABLES = [
    ...Object.values(liftingSchema),
    ...Object.values(tradingSchema),
]
    .filter((value) => is(value, PgTable))
    .filter((table) => {
        const columns = getTableColumns(table);
        return 'userId' in columns || 'ownerId' in columns;
    })
    .map((table) => getTableName(table));

function deletesOf(queries: readonly IssuedQuery[]): IssuedQuery[] {
    return queries.filter((query) => /^delete from/i.test(query.text));
}

describe('deleteUserOwnedData', () => {
    it('removes every lifting and trading row the user owns in one transaction', async () => {
        const { database, queries } = createFakeDatabase(() => []);

        await deleteUserOwnedData(database, USER_ID);

        expect(OWNED_TABLES.length).toBeGreaterThan(0);
        const deletes = deletesOf(queries);
        expect(new Set(deletes.map((query) => writeTable(query)))).toEqual(
            new Set(OWNED_TABLES),
        );
        for (const query of deletes) {
            const owner = OWNER_COLUMN.exec(query.text);
            expect(owner, query.text).not.toBeNull();
            expect(query.params[Number(owner?.[1]) - 1], query.text).toBe(
                USER_ID,
            );
        }
        expect(transactionSteps(queries)).toEqual([
            TransactionStep.Begin,
            TransactionStep.Commit,
        ]);
    });
});
