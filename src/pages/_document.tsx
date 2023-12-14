import { Html, Head, Main, NextScript } from 'next/document';

export default function Document() {
    return (
        <Html lang='en'>
            <Head>
                <link rel='apple-touch-icon' sizes='180x180' href='/static/icons/apple-touch-icon.png' />
                <link rel='icon' type='image/png' sizes='32x32' href='/static/icons/favicon-32x32.png' />
                <link rel='icon' type='image/png' sizes='16x16' href='/static/icons/favicon-16x16.png' />
                <link rel='manifest' href='/site.webmanifest' />
                <meta name='theme-color' content='#ffffff' media='(prefers-color-scheme: light)' />
                <meta name='theme-color' content='#000000' media='(prefers-color-scheme: dark)' />
            </Head>

            <body>
                <Main />
                <NextScript />
            </body>
        </Html>
    );
}
