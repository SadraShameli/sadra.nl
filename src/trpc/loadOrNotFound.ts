import 'server-only';
import { TRPCError } from '@trpc/server';
import { notFound, unstable_rethrow } from 'next/navigation';
import { z } from 'zod';

const routeIdSchema = z.uuid();

export async function loadOrNotFound<T>(load: () => Promise<T>): Promise<T> {
    try {
        return await load();
    } catch (error) {
        unstable_rethrow(error);
        if (error instanceof TRPCError && error.code === 'NOT_FOUND') {
            notFound();
        }
        throw error;
    }
}

export function routeIdOrNotFound(id: string): string {
    const parsed = routeIdSchema.safeParse(id);
    if (!parsed.success) notFound();
    return parsed.data;
}
