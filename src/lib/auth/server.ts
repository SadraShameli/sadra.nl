import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { nextCookies } from 'better-auth/next-js';
import { admin, magicLink } from 'better-auth/plugins';
import { eq } from 'drizzle-orm';
import { headers } from 'next/headers';

import { env } from '~/env';
import { ac, roles } from '~/lib/auth/permissions';
import { ROLE, ROOT_EMAIL } from '~/lib/auth/roles';
import {
    EmailVerificationEmail,
    MagicLinkEmail,
    mailer,
    PasswordResetEmail,
    SignUpNotificationEmail,
} from '~/lib/email';
import { captureError } from '~/lib/observability/logger';
import { getPublicSiteOrigin } from '~/lib/site/url';
import { db } from '~/server/db';
import { user as userTable } from '~/server/db/schemas/auth';

const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;
const SESSION_UPDATE_INTERVAL_SECONDS = 60 * 60;

export const auth = betterAuth({
    account: {
        accountLinking: {
            enabled: true,
            requireLocalEmailVerified: true,
            trustedProviders: ['google', 'github'],
        },
    },
    advanced: {
        cookies: {
            session_token: { attributes: { sameSite: 'strict', secure: true } },
        },
        useSecureCookies: env.NODE_ENV === 'production',
    },
    baseURL: env.NEXT_PUBLIC_SERVER_URL,
    database: drizzleAdapter(db, { provider: 'pg' }),
    databaseHooks: {
        user: {
            create: {
                after: async (createdUser) => {
                    if (createdUser.email.toLowerCase() === ROOT_EMAIL) {
                        await db
                            .update(userTable)
                            .set({ role: ROLE.ROOT })
                            .where(eq(userTable.id, createdUser.id));
                    }
                    mailer
                        .send(
                            new SignUpNotificationEmail(
                                ROOT_EMAIL,
                                createdUser.email,
                                createdUser.name,
                            ),
                        )
                        .catch((error: unknown) =>
                            captureError(error, {
                                fields: { email: createdUser.email },
                                tag: 'auth.signup.notify',
                            }),
                        );
                },
            },
        },
    },
    emailAndPassword: {
        enabled: true,
        minPasswordLength: 12,
        requireEmailVerification: true,
        sendResetPassword: async ({ url, user }) => {
            await mailer.send(new PasswordResetEmail(user.email, url));
        },
    },
    emailVerification: {
        autoSignInAfterVerification: true,
        sendOnSignUp: true,
        sendVerificationEmail: async ({ url, user }) => {
            await mailer.send(new EmailVerificationEmail(user.email, url));
        },
    },
    plugins: [
        magicLink({
            sendMagicLink: async ({ email, url }) => {
                await mailer.send(new MagicLinkEmail(email, url));
            },
        }),
        admin({
            ac,
            adminRoles: [ROLE.ADMIN, ROLE.ROOT],
            defaultRole: ROLE.USER,
            roles,
        }),
        nextCookies(),
    ],
    rateLimit: {
        enabled: env.NODE_ENV === 'production',
        max: 30,
        window: 15 * 60,
    },
    secret: env.AUTH_SECRET,
    session: {
        cookieCache: { enabled: false },
        expiresIn: SESSION_TTL_SECONDS,
        updateAge: SESSION_UPDATE_INTERVAL_SECONDS,
    },
    socialProviders: {
        ...(env.AUTH_GOOGLE_ID &&
            env.AUTH_GOOGLE_SECRET && {
                google: {
                    clientId: env.AUTH_GOOGLE_ID,
                    clientSecret: env.AUTH_GOOGLE_SECRET,
                },
            }),
        ...(env.AUTH_GITHUB_ID &&
            env.AUTH_GITHUB_SECRET && {
                github: {
                    clientId: env.AUTH_GITHUB_ID,
                    clientSecret: env.AUTH_GITHUB_SECRET,
                },
            }),
    },
    trustedOrigins: [getPublicSiteOrigin()],
});

export type Session = typeof auth.$Infer.Session;

export const getServerSession = async () =>
    auth.api.getSession({ headers: await headers() });
