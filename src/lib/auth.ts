import { DrizzleAdapter } from '@auth/drizzle-adapter';
import { compare } from 'bcryptjs';
import { eq } from 'drizzle-orm';
import type { NextAuthConfig } from 'next-auth';
import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import GitHub from 'next-auth/providers/github';
import Google from 'next-auth/providers/google';
import Email from 'next-auth/providers/nodemailer';
import { headers } from 'next/headers';

import { env } from '~/env';
import { sendMagicLinkEmail } from '~/lib/email';
import { credentialsSchema } from '~/lib/schemas/session';
import { accounts, db, sessions, users, verificationTokens } from '~/server/db';

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

async function readRequestMetadata(): Promise<{
    userAgent: string | null;
    ipAddress: string | null;
}> {
    try {
        const h = await headers();
        const userAgent = h.get('user-agent');
        const ipAddress =
            h.get('x-forwarded-for')?.split(',')[0]?.trim() ??
            h.get('x-real-ip') ??
            null;
        return { userAgent, ipAddress };
    } catch {
        return { userAgent: null, ipAddress: null };
    }
}

const providers: NextAuthConfig['providers'] = [
    Credentials({
        credentials: {
            email: { label: 'Email', type: 'email' },
            password: { label: 'Password', type: 'password' },
        },
        async authorize(raw) {
            const parsed = credentialsSchema.safeParse(raw);
            if (!parsed.success) return null;
            const { email, password } = parsed.data;

            const [user] = await db
                .select()
                .from(users)
                .where(eq(users.email, email))
                .limit(1);

            if (!user?.password) return null;

            const valid = await compare(password, user.password);
            if (!valid) return null;

            return {
                id: user.id,
                name: user.name,
                email: user.email,
                image: user.image,
            };
        },
    }),
    Email({
        from: 'auth@sadra.nl',
        server: { host: 'unused', port: 0, auth: { user: '', pass: '' } },
        sendVerificationRequest: async (params: {
            identifier: string;
            url: string;
        }) => {
            await sendMagicLinkEmail(params.identifier, params.url);
        },
    }),
];

const googleId: string | undefined = env.AUTH_GOOGLE_ID;
const googleSecret: string | undefined = env.AUTH_GOOGLE_SECRET;
if (googleId && googleSecret) {
    providers.push(
        Google({
            clientId: googleId,
            clientSecret: googleSecret,
            allowDangerousEmailAccountLinking: true,
        }),
    );
}

const githubId: string | undefined = env.AUTH_GITHUB_ID;
const githubSecret: string | undefined = env.AUTH_GITHUB_SECRET;
if (githubId && githubSecret) {
    providers.push(
        GitHub({
            clientId: githubId,
            clientSecret: githubSecret,
            allowDangerousEmailAccountLinking: true,
        }),
    );
}

export const { auth, signIn, signOut, handlers } = NextAuth({
    trustHost: true,
    adapter: DrizzleAdapter(db, {
        usersTable: users,
        accountsTable: accounts,
        sessionsTable: sessions,
        verificationTokensTable: verificationTokens,
    }),
    session: { strategy: 'jwt', maxAge: SESSION_TTL_MS / 1000 },
    providers,
    callbacks: {
        async jwt({ token, user, account }) {
            if (user?.id && account) {
                const meta = await readRequestMetadata();
                const sessionToken = crypto.randomUUID();
                const expires = new Date(Date.now() + SESSION_TTL_MS);
                await db.insert(sessions).values({
                    sessionToken,
                    userId: user.id,
                    expires,
                    userAgent: meta.userAgent,
                    ipAddress: meta.ipAddress,
                });
                token.sessionToken = sessionToken;
                token.userId = user.id;
            }
            return token;
        },
        async session({ session, token }) {
            if (token?.userId) {
                session.user.id = token.userId as string;
            }
            return session;
        },
    },
    jwt: {
        encode: async ({ token }) => {
            return (token?.sessionToken as string | undefined) ?? '';
        },
        decode: async ({ token }) => {
            if (!token) return null;
            const rows = await db
                .select({
                    userId: sessions.userId,
                    expires: sessions.expires,
                })
                .from(sessions)
                .where(eq(sessions.sessionToken, token))
                .limit(1);
            const row = rows[0];
            if (!row || row.expires < new Date()) return null;
            return {
                sessionToken: token,
                userId: row.userId,
            };
        },
    },
    events: {
        async signOut(message) {
            const token =
                'token' in message && message.token
                    ? (message.token.sessionToken as string | undefined)
                    : undefined;
            if (token) {
                await db
                    .delete(sessions)
                    .where(eq(sessions.sessionToken, token));
            }
        },
    },
    pages: {
        signIn: '/login',
        error: '/login',
        verifyRequest: '/verify-request',
    },
});
