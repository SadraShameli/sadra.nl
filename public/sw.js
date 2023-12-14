importScripts('https://storage.googleapis.com/workbox-cdn/releases/4.0.0-alpha.0/workbox-sw.js');

workbox.core.setCacheNameDetails({
    prefix: 'asmall',
});

workbox.routing.registerRoute(/(\/|\.js)$/, workbox.strategies.staleWhileRevalidate());

self.addEventListener('message', (event) => {
    switch (event.data) {
        case 'skipWaiting':
            self.skipWaiting();
            break;
        default:
            break;
    }
});
