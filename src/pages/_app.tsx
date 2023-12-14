import Script from 'next/script';
import { useEffect } from 'react';
import { type AppProps } from 'next/app';

import '~/styles/main.css';

let reloadInterval: NodeJS.Timeout;

const GOOGLE_ANALYTICS_ID = 'G-RC2BS5NY0W';

function lazyReload() {
    clearInterval(reloadInterval);
    reloadInterval = setInterval(() => {
        if (document.hasFocus()) {
            window.location.reload();
        }
    }, 100);
}

function forcePageReload(registration: ServiceWorkerRegistration) {
    if (!navigator.serviceWorker.controller) {
        return;
    }

    if (registration.waiting) {
        registration.waiting.postMessage('skipWaiting');
        return;
    }

    function listenInstalledStateChange() {
        registration.installing?.addEventListener('statechange', function () {
            if (this.state === 'installed' && registration.waiting) {
                registration.waiting.postMessage('skipWaiting');
            } else if (this.state === 'activated') {
                lazyReload();
            }
        });
    }

    if (registration.installing) {
        listenInstalledStateChange();
        return;
    }

    registration.addEventListener('updatefound', listenInstalledStateChange);
}

async function registerServiceWorker() {
    if (process.env.NODE_ENV === 'production' && 'serviceWorker' in navigator) {
        const registration = await navigator.serviceWorker.register('/sw.js');
        forcePageReload(registration);
    }
}

export default function MyApp({ Component, pageProps }: AppProps) {
    useEffect(() => {
        void registerServiceWorker();
    }, []);

    return (
        <>
            <Script src={`https://www.googletagmanager.com/gtag/js?id=${GOOGLE_ANALYTICS_ID}`} strategy='afterInteractive' />
            <Script id='google-analytics' strategy='afterInteractive'>
                {`window.dataLayer = window.dataLayer || [];function gtag(){window.dataLayer.push(arguments);}
                    gtag('js', new Date());gtag('config', '${GOOGLE_ANALYTICS_ID}');`}
            </Script>

            <Component {...pageProps} />
        </>
    );
}
