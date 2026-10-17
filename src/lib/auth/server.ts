import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { nextCookies } from 'better-auth/next-js';
import { admin, magicLink } from 'better-auth/plugins';
import { eq } from 'drizzle-orm';
import { headers } from 'next/headers';
import { after } from 'next/server';
import { cache } from 'react';

import { environment } from '~/environment';
import { authAccountOptions } from '~/lib/auth/accountOptions';
import { authLogger } from '~/lib/auth/authLogger';
import { authBackgroundTasks } from '~/lib/auth/backgroundTasks';
import { authEmailAndPasswordOptions } from '~/lib/auth/emailAndPasswordOptions';
import { EMAIL_LINK_LIFETIME_SECONDS, EmailLink } from '~/lib/auth/EmailLink';
import { adminPluginOptions } from '~/lib/auth/permissions';
import {
    authIpAddressOptions,
    authRateLimitOptions,
} from '~/lib/auth/rateLimitOptions';
import { enforceRoleHierarchy } from '~/lib/auth/RoleHierarchy';
import { ROLE, ROOT_EMAIL } from '~/lib/auth/roles';
import { authUserOptions } from '~/lib/auth/userOptions';
import {
    AccountDeletionEmail,
    EmailChangeConfirmationEmail,
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
import { deleteUserOwnedData } from '~/server/helpers/UserOwnedData';

const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;
const SESSION_UPDATE_INTERVAL_SECONDS = 60 * 60;

export const auth = betterAuth({
    account: authAccountOptions,
    advanced: {
        backgroundTasks: authBackgroundTasks,
        cookies: {
            session_token: { attributes: { sameSite: 'strict', secure: true } },
        },
        ipAddress: authIpAddressOptions,
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
                    after(async () => {
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
                    });
                },
            },
            delete: {
                before: async (deletedUser) => {
                    await deleteUserOwnedData(db, deletedUser.id);
                },
            },
        },
    },
    emailAndPassword: authEmailAndPasswordOptions(async (to, url) => {
        await mailer.send(new PasswordResetEmail(to, url));
    }),
    emailVerification: {
        autoSignInAfterVerification: true,
        expiresIn: EMAIL_LINK_LIFETIME_SECONDS[EmailLink.Verification],
        sendOnSignUp: true,
        sendVerificationEmail: async ({ url, user }) => {
            await mailer.send(new EmailVerificationEmail(user.email, url));
        },
    },
    hooks: { before: enforceRoleHierarchy },
    logger: authLogger,
    plugins: [
        magicLink({
            expiresIn: EMAIL_LINK_LIFETIME_SECONDS[EmailLink.SignIn],
            sendMagicLink: async ({ email, url }) => {
                await mailer.send(new MagicLinkEmail(email, url));
            },
        }),
        admin(adminPluginOptions),
        nextCookies(),
    ],
    rateLimit: authRateLimitOptions(environment.NODE_ENV === 'production'),
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
    user: authUserOptions({
        confirmAccountDeletion: async (to, url) => {
            await mailer.send(new AccountDeletionEmail(to, url));
        },
        confirmEmailChange: async (to, newEmail, url) => {
            await mailer.send(
                new EmailChangeConfirmationEmail(to, newEmail, url),
            );
        },
    }),
});

export type Session = typeof auth.$Infer.Session;

export const getServerSession = cache(async () =>
    auth.api.getSession({ headers: await headers() }),
);
