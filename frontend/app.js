import { initApp } from './app/index.js';

document.addEventListener('DOMContentLoaded', () => {
    initApp();
});

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        const refreshBtn = document.getElementById('refresh-btn');
        const updateToast = document.getElementById('update-toast');
        const updateToastReload = document.getElementById('update-toast-reload');
        const updateToastClose = document.getElementById('update-toast-close');
        let userRequestedReload = false;
        let waitingWorker = null;
        let fallbackReloadTimer = null;
        let swRegistration = null;

        const STORAGE_SEEN_BUILD_ID = 'topobus_build_id_seen';
        const STORAGE_PENDING_BUILD_ID = 'topobus_build_id_pending';

        const setUpdateBadge = (enabled) => {
            if (!refreshBtn) return;
            refreshBtn.classList.toggle('update-available', !!enabled);
        };

        const showToast = () => {
            if (!updateToast) return;
            updateToast.classList.remove('hidden');
        };

        const hideToast = () => {
            if (!updateToast) return;
            updateToast.classList.add('hidden');
        };

        const showUpdateAvailable = (worker) => {
            waitingWorker = worker || waitingWorker;
            if (refreshBtn) {
                refreshBtn.disabled = false;
                refreshBtn.title = 'New version available - click to reload';
            }
            setUpdateBadge(true);
            showToast();
        };

        const hideUpdateAvailable = () => {
            waitingWorker = null;
            if (refreshBtn) {
                refreshBtn.disabled = false;
                refreshBtn.title = 'Reload';
            }
            setUpdateBadge(false);
            hideToast();
        };

        navigator.serviceWorker.addEventListener('controllerchange', () => {
            // Only reload when the user explicitly accepted the update.
            if (!userRequestedReload) return;
            if (fallbackReloadTimer) {
                clearTimeout(fallbackReloadTimer);
                fallbackReloadTimer = null;
            }
            window.location.reload();
        });

        if (updateToastReload) {
            updateToastReload.addEventListener('click', () => {
                refreshBtn?.click();
            });
        }

        if (updateToastClose) {
            updateToastClose.addEventListener('click', () => {
                // Keep the badge (update still pending), just hide the toast.
                hideToast();
            });
        }

        if (refreshBtn) {
            refreshBtn.addEventListener('click', async () => {
                userRequestedReload = true;
                refreshBtn.disabled = true;

                // If we already detected a newer build id (polling) but the SW isn't
                // in a waiting state yet, treat an explicit user reload as accepting
                // that update to prevent the toast from reappearing indefinitely.
                try {
                    const pending = localStorage.getItem(STORAGE_PENDING_BUILD_ID);
                    if (pending) {
                        localStorage.setItem(STORAGE_SEEN_BUILD_ID, pending);
                        localStorage.removeItem(STORAGE_PENDING_BUILD_ID);
                    }
                } catch {}
                try {
                    if (waitingWorker) {
                        // User accepted update: mark pending build id as applied (best-effort).
                        try {
                            const pending = localStorage.getItem(STORAGE_PENDING_BUILD_ID);
                            if (pending) {
                                localStorage.setItem(STORAGE_SEEN_BUILD_ID, pending);
                                localStorage.removeItem(STORAGE_PENDING_BUILD_ID);
                            }
                        } catch {}

                        waitingWorker.postMessage({ type: 'SKIP_WAITING' });
                        // If controllerchange doesn't arrive (rare), fall back.
                        fallbackReloadTimer = setTimeout(() => window.location.reload(), 4000);
                        return;
                    }

                    const registration = swRegistration || (await navigator.serviceWorker.getRegistration());
                    if (!registration) {
                        window.location.reload();
                        return;
                    }

                    // If we detected a newer build id but SW isn't waiting yet, try to pull it.
                    // (On some browsers, update checks can be delayed/throttled.)
                    const hasPendingBuild = (() => {
                        try {
                            return !!localStorage.getItem(STORAGE_PENDING_BUILD_ID);
                        } catch {
                            return false;
                        }
                    })();

                    await registration.update().catch(() => {});
                    if (registration.waiting) {
                        try {
                            const pending = localStorage.getItem(STORAGE_PENDING_BUILD_ID);
                            if (pending) {
                                localStorage.setItem(STORAGE_SEEN_BUILD_ID, pending);
                                localStorage.removeItem(STORAGE_PENDING_BUILD_ID);
                            }
                        } catch {}

                        registration.waiting.postMessage({ type: 'SKIP_WAITING' });
                        fallbackReloadTimer = setTimeout(() => window.location.reload(), 4000);
                        return;
                    }

                    if (hasPendingBuild) {
                        // Give the SW a brief chance to reach waiting state.
                        const deadline = Date.now() + 4000;
                        while (Date.now() < deadline) {
                            await new Promise((r) => setTimeout(r, 250));
                            await registration.update().catch(() => {});
                            if (registration.waiting) {
                                try {
                                    const pending = localStorage.getItem(STORAGE_PENDING_BUILD_ID);
                                    if (pending) {
                                        localStorage.setItem(STORAGE_SEEN_BUILD_ID, pending);
                                        localStorage.removeItem(STORAGE_PENDING_BUILD_ID);
                                    }
                                } catch {}

                                registration.waiting.postMessage({ type: 'SKIP_WAITING' });
                                fallbackReloadTimer = setTimeout(() => window.location.reload(), 4000);
                                return;
                            }
                        }
                    }

                    // No waiting worker: fall back to a normal reload.
                    window.location.reload();
                } catch {
                    window.location.reload();
                } finally {
                    // If controllerchange triggers, we'll reload anyway.
                    // Re-enable button to keep UI responsive if no SW.
                    refreshBtn.disabled = false;
                }
            });
        }

        navigator.serviceWorker
            .register('./sw.js', { updateViaCache: 'none' })
            .then((registration) => {
                swRegistration = registration;
                // Proactively check for updates on load.
                registration.update().catch(() => {});

                const trackInstallingWorker = (worker) => {
                    if (!worker) return;
                    worker.addEventListener('statechange', () => {
                        // When a new version is installed, show the refresh button.
                        if (worker.state === 'installed' && navigator.serviceWorker.controller) {
                            showUpdateAvailable(registration.waiting || worker);
                        }

                        // If the update becomes redundant or activated without reload intent, hide.
                        if (worker.state === 'redundant') {
                            hideUpdateAvailable();
                        }
                    });
                };

                // If an update is already waiting (e.g. opened app after deploy)
                if (registration.waiting && navigator.serviceWorker.controller) {
                    showUpdateAvailable(registration.waiting);
                }

                registration.addEventListener('updatefound', () => {
                    trackInstallingWorker(registration.installing);
                });

                trackInstallingWorker(registration.installing);

                // Extra reliability for GitHub Pages/static hosting:
                // check the generated build id and prompt even if the SW doesn't end up "waiting"
                // (e.g. because the SW calls skipWaiting() during install).
                const checkBuildId = async () => {
                    try {
                        const url = new URL('./build-id.txt', window.location.href);
                        const res = await fetch(url.toString(), {
                            cache: 'no-store',
                            credentials: 'same-origin'
                        });
                        if (!res.ok) return;
                        const remote = (await res.text()).trim();
                        if (!remote) return;

                        let seen = null;
                        let pending = null;
                        try {
                            seen = localStorage.getItem(STORAGE_SEEN_BUILD_ID);
                            pending = localStorage.getItem(STORAGE_PENDING_BUILD_ID);
                        } catch {
                            // If storage is unavailable, we can still prompt when SW is waiting.
                        }

                        // If storage contains a stale pending marker, clear it.
                        if (pending && (pending === seen || remote === seen)) {
                            try {
                                localStorage.removeItem(STORAGE_PENDING_BUILD_ID);
                            } catch {}
                            pending = null;
                        }

                        if (!seen) {
                            try {
                                localStorage.setItem(STORAGE_SEEN_BUILD_ID, remote);
                            } catch {}
                            return;
                        }

                        // If we've already detected the pending build, keep prompting.
                        if (pending && pending !== seen) {
                            showUpdateAvailable(registration.waiting || null);
                            return;
                        }

                        if (remote !== seen) {
                            try {
                                localStorage.setItem(STORAGE_PENDING_BUILD_ID, remote);
                            } catch {}
                            // Trigger an update check; the SW should update because sw.generated.js changed.
                            registration.update().catch(() => {});
                            showUpdateAvailable(registration.waiting || null);
                        }
                    } catch {
                        // Offline or blocked; ignore.
                    }
                };

                // Run once shortly after load, then periodically.
                setTimeout(() => checkBuildId(), 1500);
                setInterval(() => checkBuildId(), 30 * 60 * 1000);
            })
            .catch((error) => {
                console.warn('Service worker registration failed:', error);
            });
    });
}
