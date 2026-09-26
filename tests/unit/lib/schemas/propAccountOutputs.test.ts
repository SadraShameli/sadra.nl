import { describe, expect, it } from 'vitest';

import {
    isInvalidStoredRecord,
    PropLimitRejection,
    PropMutationRejection,
    PropQuota,
    PropRecord,
    type PropRejection,
    PropStoredRecordRejection,
} from '~/lib/schemas/propAccountOutputs';

function errorWith(message: string, data: unknown): Error {
    return Object.assign(new Error(message), { data });
}

function invalidStored(record: PropRecord): Error {
    return errorWith(`Your stored ${record} is not valid`, {
        code: 'PRECONDITION_FAILED',
        propRejection: rejection({ record }),
    });
}

function rejection(overrides: Partial<PropRejection>): PropRejection {
    return {
        lifecycleRejection: null,
        limit: null,
        quota: null,
        reason: PropStoredRecordRejection.InvalidStoredRecord,
        record: PropRecord.Account,
        recordId: null,
        ...overrides,
    };
}

describe('isInvalidStoredRecord', () => {
    it.each(Object.values(PropRecord))(
        'is true for an invalid stored %s asked about as that record kind',
        (record) => {
            expect(isInvalidStoredRecord(invalidStored(record), record)).toBe(
                true,
            );
        },
    );

    it.each(Object.values(PropRecord))(
        'is false for an invalid stored %s asked about as any other record kind',
        (record) => {
            for (const other of Object.values(PropRecord)) {
                if (other === record) continue;
                expect(
                    isInvalidStoredRecord(invalidStored(record), other),
                    other,
                ).toBe(false);
            }
        },
    );

    it('is false for another rejection reason on the same record kind', () => {
        const mutation = errorWith('duplicate', {
            propRejection: rejection({
                reason: PropMutationRejection.DuplicateSnapshot,
                record: PropRecord.Snapshot,
            }),
        });
        const quota = errorWith('quota', {
            propRejection: rejection({
                limit: 100,
                quota: PropQuota.Scenarios,
                reason: PropLimitRejection.QuotaExceeded,
                record: PropRecord.Scenario,
            }),
        });
        expect(isInvalidStoredRecord(mutation, PropRecord.Snapshot)).toBe(
            false,
        );
        expect(isInvalidStoredRecord(quota, PropRecord.Scenario)).toBe(false);
    });

    it('is false for an invalid stored record that names no record kind', () => {
        const unnamed = errorWith('stored row is not valid', {
            propRejection: rejection({ record: null }),
        });
        for (const record of Object.values(PropRecord)) {
            expect(isInvalidStoredRecord(unnamed, record), record).toBe(false);
        }
    });

    it.each([
        ['a plain error', new Error('network down')],
        ['no error at all', null],
        ['undefined', undefined],
        [
            'a non-error value carrying a rejection',
            {
                data: {
                    propRejection: rejection({ record: PropRecord.Rulebook }),
                },
            },
        ],
        ['an error whose data is not an object', errorWith('x', 'text')],
        ['an error whose data is null', errorWith('x', null)],
        ['an error without a rejection', errorWith('x', { code: 'X' })],
        [
            'a malformed rejection',
            errorWith('x', {
                propRejection: {
                    ...rejection({ record: PropRecord.Rulebook }),
                    reason: 'made-up',
                },
            }),
        ],
        [
            'a rejection naming an unknown record kind',
            errorWith('x', {
                propRejection: {
                    ...rejection({}),
                    record: 'made-up record',
                },
            }),
        ],
    ])('is false for %s', (_, error) => {
        for (const record of Object.values(PropRecord)) {
            expect(isInvalidStoredRecord(error, record), record).toBe(false);
        }
    });
});
