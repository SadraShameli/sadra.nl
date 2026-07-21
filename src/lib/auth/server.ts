import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { nextCookies } from 'better-auth/next-js';
import { admin, magicLink } from 'better-auth/plugins';
import { eq } from 'drizzle-orm';
import { headers } from 'next/headers';

import { environment } from '~/environment';
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
        useSecureCookies: environment.NODE_ENV === 'production',
    },
    baseURL: environment.NEXT_PUBLIC_SERVER_URL,
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
                    void (async () => {
                        try {
                            await mailer.send(
                                new SignUpNotificationEmail(
                                    ROOT_EMAIL,
                                    createdUser.email,
                                    createdUser.name,
                                ),
                            );
                        } catch (error: unknown) {
                            captureError(error, {
                                fields: { email: createdUser.email },
                                tag: 'auth.signup.notify',
                            });
                        }
                    })();
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
        enabled: environment.NODE_ENV === 'production',
        max: 30,
        window: 15 * 60,
    },
    secret: environment.AUTH_SECRET,
    session: {
        cookieCache: { enabled: false },
        expiresIn: SESSION_TTL_SECONDS,
        updateAge: SESSION_UPDATE_INTERVAL_SECONDS,
    },
    socialProviders: {
        ...(environment.AUTH_GOOGLE_ID &&
            environment.AUTH_GOOGLE_SECRET && {
                google: {
                    clientId: environment.AUTH_GOOGLE_ID,
                    clientSecret: environment.AUTH_GOOGLE_SECRET,
                },
            }),
        ...(environment.AUTH_GITHUB_ID &&
            environment.AUTH_GITHUB_SECRET && {
                github: {
                    clientId: environment.AUTH_GITHUB_ID,
                    clientSecret: environment.AUTH_GITHUB_SECRET,
                },
            }),
    },
    trustedOrigins: [getPublicSiteOrigin()],
});

export type Session = typeof auth.$Infer.Session;

export const getServerSession = async () =>
    auth.api.getSession({ headers: await headers() });
