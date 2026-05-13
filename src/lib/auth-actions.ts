'use server';

import { hash, compare } from 'bcryptjs';
import { createHash, randomBytes } from 'crypto';
import { eq } from 'drizzle-orm';
import { AuthError } from 'next-auth';
import { redirect } from 'next/navigation';

import { auth, signIn, signOut } from '~/lib/auth';
import { sendPasswordResetEmail } from '~/lib/email';
import {
    forgotPasswordInputSchema,
    loginInputSchema,
    resetPasswordInputSchema,
    signupInputSchema,
    updateNameInputSchema,
    updatePasswordInputSchema,
    type ForgotPasswordInput,
    type LoginInput,
    type ResetPasswordInput,
    type SignupInput,
    type UpdateNameInput,
    type UpdatePasswordInput,
} from '~/lib/schemas/auth';
import { db, passwordResetTokens, users } from '~/server/db';

export async function login(input: LoginInput): Promise<void> {
    const data = loginInputSchema.parse(input);
    try {
        await signIn('credentials', {
            email: data.email,
            password: data.password,
            redirectTo: '/',
        });
    } catch (error) {
        if (error instanceof AuthError) {
            redirect('/login?error=invalid');
        }
        throw error;
    }
}

export async function signup(input: SignupInput): Promise<void> {
    const data = signupInputSchema.parse(input);

    const [existing] = await db
        .select()
        .from(users)
        .where(eq(users.email, data.email))
        .limit(1);
    if (existing) {
        redirect('/signup?error=taken');
    }

    const hashed = await hash(data.password, 12);
    await db
        .insert(users)
        .values({ name: data.name, email: data.email, password: hashed });

    try {
        await signIn('credentials', {
            email: data.email,
            password: data.password,
            redirectTo: '/',
        });
    } catch (error) {
        if (error instanceof AuthError) {
            redirect('/login');
        }
        throw error;
    }
}

export async function requestPasswordReset(
    input: ForgotPasswordInput,
): Promise<void> {
    const data = forgotPasswordInputSchema.parse(input);

    const [user] = await db
        .select({ id: users.id, email: users.email })
        .from(users)
        .where(eq(users.email, data.email))
        .limit(1);

    if (user) {
        await db
            .delete(passwordResetTokens)
            .where(eq(passwordResetTokens.userId, user.id));

        const rawToken = randomBytes(32).toString('hex');
        const tokenHash = createHash('sha256').update(rawToken).digest('hex');
        const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

        await db.insert(passwordResetTokens).values({
            userId: user.id,
            tokenHash,
            expiresAt,
        });

        await sendPasswordResetEmail(user.email, rawToken);
    }

    redirect('/forgot-password?sent=1');
}

export async function resetPassword(input: ResetPasswordInput): Promise<void> {
    const data = resetPasswordInputSchema.parse(input);

    const tokenHash = createHash('sha256').update(data.token).digest('hex');

    const [row] = await db
        .select()
        .from(passwordResetTokens)
        .where(eq(passwordResetTokens.tokenHash, tokenHash))
        .limit(1);

    if (!row || row.expiresAt < new Date()) {
        redirect('/reset-password?error=expired');
    }

    await db
        .update(users)
        .set({ password: await hash(data.password, 12) })
        .where(eq(users.id, row.userId));

    await db
        .delete(passwordResetTokens)
        .where(eq(passwordResetTokens.id, row.id));

    redirect('/login?success=reset');
}

export async function logout(): Promise<void> {
    await signOut({ redirectTo: '/' });
}

export async function updateName(input: UpdateNameInput): Promise<void> {
    const data = updateNameInputSchema.parse(input);

    const session = await auth();
    if (!session?.user?.id) redirect('/login');

    await db
        .update(users)
        .set({ name: data.name })
        .where(eq(users.id, session.user.id));
    redirect('/profile?success=name');
}

export async function deleteAccount(): Promise<void> {
    const session = await auth();
    if (!session?.user?.id) redirect('/login');

    await db.delete(users).where(eq(users.id, session.user.id));
    await signOut({ redirectTo: '/' });
}

export async function updatePassword(
    input: UpdatePasswordInput,
): Promise<void> {
    const data = updatePasswordInputSchema.parse(input);

    const session = await auth();
    if (!session?.user?.id) redirect('/login');

    const [user] = await db
        .select()
        .from(users)
        .where(eq(users.id, session.user.id))
        .limit(1);

    if (!user?.password) redirect('/profile?error=pw_fail');

    const valid = await compare(data.current, user.password);
    if (!valid) redirect('/profile?error=pw_wrong');

    await db
        .update(users)
        .set({ password: await hash(data.password, 12) })
        .where(eq(users.id, session.user.id));

    redirect('/profile?success=password');
}
