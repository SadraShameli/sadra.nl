'use server';

import { compare, hash } from 'bcryptjs';
import { and, eq, ne } from 'drizzle-orm';
import { AuthError, CredentialsSignin } from 'next-auth';
import { redirect } from 'next/navigation';
import { createHash, randomBytes } from 'node:crypto';

import { auth, signIn, signOut } from '~/lib/auth/config';
import { isRedirectError } from '~/lib/auth/redirect-error';
import { sendPasswordResetEmail, sendSignUpNotification } from '~/lib/email';
import { checkRateLimit } from '~/lib/observability/rate-limit';
import {
    callbackUrlSchema,
    type ForgotPasswordInput,
    forgotPasswordInputSchema,
    type LoginInput,
    loginInputSchema,
    type MagicLinkInput,
    magicLinkInputSchema,
    type OAuthSignInInput,
    oauthSignInInputSchema,
    type ResetPasswordInput,
    resetPasswordInputSchema,
    type SetPasswordInput,
    setPasswordInputSchema,
    type SignupInput,
    signupInputSchema,
    type UpdateEmailInput,
    updateEmailInputSchema,
    type UpdateNameInput,
    updateNameInputSchema,
    type UpdatePasswordInput,
    updatePasswordInputSchema,
} from '~/lib/schemas/auth';
import { routes, withQuery } from '~/lib/site/routes';
import { db, passwordResetTokens, sessions, users } from '~/server/db';

const DEFAULT_REDIRECT = routes.home;

export async function deleteAccount(): Promise<void> {
    const session = await auth();
    if (!session?.user.id) redirect(routes.auth.login);

    await db.delete(users).where(eq(users.id, session.user.id));
    await signOut({ redirectTo: routes.home });
}

export async function login(input: LoginInput): Promise<void> {
    const data = loginInputSchema.parse(input);
    const target = safeRedirectTarget(data.callbackUrl);
    try {
        await signIn('credentials', {
            email: data.email,
            password: data.password,
            redirectTo: target,
        });
    } catch (error) {
        if (isRedirectError(error)) throw error;
        if (error instanceof CredentialsSignin) {
            redirect(
                withQuery(routes.auth.login, {
                    callbackUrl: data.callbackUrl,
                    error: 'invalid',
                }),
            );
        }
        if (error instanceof AuthError) {
            redirect(withQuery(routes.auth.error, { error: 'sign_in' }));
        }
        throw error;
    }
}

export async function logout(): Promise<void> {
    await signOut({ redirectTo: routes.home });
}

export async function requestPasswordReset(
    input: ForgotPasswordInput,
): Promise<void> {
    const data = forgotPasswordInputSchema.parse(input);

    const allowed = await checkRateLimit({
        bucket: 'forgot-password',
        key: data.email,
        max: 5,
        windowMs: 60 * 60 * 1000,
    });

    const [user] = await db
        .select({ email: users.email, id: users.id })
        .from(users)
        .where(eq(users.email, data.email))
        .limit(1);

    if (allowed && user) {
        await db
            .delete(passwordResetTokens)
            .where(eq(passwordResetTokens.userId, user.id));

        const rawToken = randomBytes(32).toString('hex');
        const tokenHash = createHash('sha256').update(rawToken).digest('hex');
        const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

        await db.insert(passwordResetTokens).values({
            expiresAt,
            tokenHash,
            userId: user.id,
        });

        await sendPasswordResetEmail(data.email, rawToken);
    }

    redirect(withQuery(routes.auth.forgotPassword, { sent: 1 }));
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
        redirect(withQuery(routes.auth.resetPassword, { error: 'expired' }));
    }

    await db
        .update(users)
        .set({ password: await hash(data.password, 12) })
        .where(eq(users.id, row.userId));

    await db
        .delete(passwordResetTokens)
        .where(eq(passwordResetTokens.id, row.id));

    await db.delete(sessions).where(eq(sessions.userId, row.userId));

    redirect(withQuery(routes.auth.login, { success: 'reset' }));
}

export async function setPassword(input: SetPasswordInput): Promise<void> {
    const data = setPasswordInputSchema.parse(input);
    const session = await auth();
    if (!session?.user.id) redirect(routes.auth.login);

    const [user] = await db
        .select({ email: users.email, password: users.password })
        .from(users)
        .where(eq(users.id, session.user.id))
        .limit(1);

    if (!user || user.password || !user.email) {
        redirect(withQuery(routes.profile, { error: 'pw_fail' }));
    }

    await db
        .update(users)
        .set({ password: await hash(data.password, 12) })
        .where(eq(users.id, session.user.id));
    redirect(withQuery(routes.profile, { success: 'password' }));
}

export async function signInWithGithub(
    input?: OAuthSignInInput,
): Promise<void> {
    const data = oauthSignInInputSchema.parse(input ?? {});
    await signIn('github', {
        redirectTo: safeRedirectTarget(data.callbackUrl),
    });
}

export async function signInWithGoogle(
    input?: OAuthSignInInput,
): Promise<void> {
    const data = oauthSignInInputSchema.parse(input ?? {});
    await signIn('google', {
        redirectTo: safeRedirectTarget(data.callbackUrl),
    });
}

export async function signInWithMagicLink(
    input: MagicLinkInput,
): Promise<void> {
    const data = magicLinkInputSchema.parse(input);

    const allowed = await checkRateLimit({
        bucket: 'magic-link',
        key: data.email,
        max: 5,
        windowMs: 60 * 60 * 1000,
    });
    if (!allowed) {
        redirect(withQuery(routes.auth.error, { error: 'rate_limited' }));
    }

    try {
        await signIn('nodemailer', {
            email: data.email,
            redirectTo: safeRedirectTarget(data.callbackUrl),
        });
    } catch (error) {
        if (isRedirectError(error)) throw error;
        if (error instanceof AuthError) {
            redirect(withQuery(routes.auth.error, { error: 'email_send' }));
        }
        throw error;
    }
}

export async function signup(input: SignupInput): Promise<void> {
    const data = signupInputSchema.parse(input);
    const target = safeRedirectTarget(data.callbackUrl);

    const hashed = await hash(data.password, 12);
    try {
        await db.insert(users).values({
            email: data.email,
            name: data.name,
            password: hashed,
        });
    } catch (error) {
        if (isPgUniqueViolation(error)) {
            redirect(withQuery(routes.auth.signup, { error: 'taken' }));
        }
        throw error;
    }

    sendSignUpNotification(data.email, data.name).catch((error: unknown) =>
        console.error('[auth] sign-up notification failed', error),
    );

    try {
        await signIn('nodemailer', {
            email: data.email,
            redirectTo: target,
        });
    } catch (error) {
        if (isRedirectError(error)) throw error;
        if (error instanceof AuthError) {
            redirect(withQuery(routes.auth.error, { error: 'email_send' }));
        }
        throw error;
    }
}

export async function updateEmail(input: UpdateEmailInput): Promise<void> {
    const data = updateEmailInputSchema.parse(input);
    const session = await auth();
    if (!session?.user.id) redirect(routes.auth.login);

    const [existing] = await db
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.email, data.email), ne(users.id, session.user.id)))
        .limit(1);
    if (existing) redirect(withQuery(routes.profile, { error: 'email_taken' }));

    await db
        .update(users)
        .set({ email: data.email })
        .where(eq(users.id, session.user.id));
    redirect(withQuery(routes.profile, { success: 'email' }));
}

export async function updateName(input: UpdateNameInput): Promise<void> {
    const data = updateNameInputSchema.parse(input);

    const session = await auth();
    if (!session?.user.id) redirect(routes.auth.login);

    await db
        .update(users)
        .set({ name: data.name })
        .where(eq(users.id, session.user.id));
    redirect(withQuery(routes.profile, { success: 'name' }));
}

export async function updatePassword(
    input: UpdatePasswordInput,
): Promise<void> {
    const data = updatePasswordInputSchema.parse(input);

    const session = await auth();
    if (!session?.user.id) redirect(routes.auth.login);

    const [user] = await db
        .select()
        .from(users)
        .where(eq(users.id, session.user.id))
        .limit(1);

    if (!user?.password)
        redirect(withQuery(routes.profile, { error: 'pw_fail' }));

    const valid = await compare(data.current, user.password);
    if (!valid) redirect(withQuery(routes.profile, { error: 'pw_wrong' }));

    const newHash = await hash(data.password, 12);
    await db
        .update(users)
        .set({ password: newHash })
        .where(eq(users.id, session.user.id));

    await db.delete(sessions).where(eq(sessions.userId, session.user.id));

    redirect(withQuery(routes.profile, { success: 'password' }));
}

function isPgUniqueViolation(error: unknown): boolean {
    return (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === '23505'
    );
}

function safeRedirectTarget(raw: null | string | undefined): string {
    if (!raw) return DEFAULT_REDIRECT;
    const parsed = callbackUrlSchema.safeParse(raw);
    return parsed.success ? parsed.data : DEFAULT_REDIRECT;
}
