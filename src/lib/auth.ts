import { eq } from 'drizzle-orm';
import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { compare } from 'bcryptjs';

import { db, users } from '~/server/db';

export const { auth, signIn, signOut, handlers } = NextAuth({
    providers: [
        Credentials({
            credentials: {
                email: { label: 'Email', type: 'email' },
                password: { label: 'Password', type: 'password' },
            },
            async authorize(credentials) {
                const email = credentials?.email as string | undefined;
                const password = credentials?.password as string | undefined;
                if (!email || !password) return null;

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
    ],
    callbacks: {
        jwt({ token, user }) {
            if (user) token.id = user.id;
            return token;
        },
        session({ session, token }) {
            if (token.id) session.user.id = token.id as string;
            return session;
        },
    },
    pages: {
        signIn: '/login',
        error: '/login',
    },
});
