import { initApp } from './app/index.js';

document.addEventListener('DOMContentLoaded', () => {
    initApp();
});

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js').catch((error) => {
            console.warn('Service worker registration failed:', error);
        });
    });
}
