'use server';

import { compare, hash } from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { redirect } from 'next/navigation';

import { auth, signOut } from '~/lib/auth';
import { db, users } from '~/server/db';

export async function logout() {
    await signOut({ redirectTo: '/' });
}

export async function updateName(formData: FormData) {
    const session = await auth();
    if (!session?.user?.id) redirect('/login');

    const name = (formData.get('name') as string).trim();
    if (!name) redirect('/profile?error=name_required');

    await db.update(users).set({ name }).where(eq(users.id, session.user.id));
    redirect('/profile?success=name');
}

export async function deleteAccount() {
    const session = await auth();
    if (!session?.user?.id) redirect('/login');

    await db.delete(users).where(eq(users.id, session.user.id));
    await signOut({ redirectTo: '/' });
}

export async function updatePassword(formData: FormData) {
    const session = await auth();
    if (!session?.user?.id) redirect('/login');

    const current = formData.get('current') as string;
    const next = formData.get('password') as string;
    const confirm = formData.get('confirm') as string;

    if (next.length < 8) redirect('/profile?error=pw_short');
    if (next !== confirm) redirect('/profile?error=pw_mismatch');

    const [user] = await db
        .select()
        .from(users)
        .where(eq(users.id, session.user.id))
        .limit(1);

    if (!user?.password) redirect('/profile?error=pw_fail');

    const valid = await compare(current, user.password);
    if (!valid) redirect('/profile?error=pw_wrong');

    await db
        .update(users)
        .set({ password: await hash(next, 12) })
        .where(eq(users.id, session.user.id));

    redirect('/profile?success=password');
}
