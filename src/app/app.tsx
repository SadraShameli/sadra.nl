'use client';

import { useEffect } from 'react';

let reloadInterval: NodeJS.Timeout;

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

export default function ClientApplication({
    children,
}: {
    children: React.ReactNode;
}) {
    useEffect(() => {
        void registerServiceWorker();
    }, []);

    return children;
}
