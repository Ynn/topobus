import { initApp } from './app/index.js';
import { getStoredProjectMeta, isProjectFilePersistenceSupported } from './app/project_file_store.js';

document.addEventListener('DOMContentLoaded', () => {
    initApp();
});

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        const refreshBtn = document.getElementById('refresh-btn');
        const updateToast = document.getElementById('update-toast');
        const updateToastTitle = document.getElementById('update-toast-title');
        const updateToastDetails = document.getElementById('update-toast-details');
        const updateToastReload = document.getElementById('update-toast-reload');
        const updateToastClose = document.getElementById('update-toast-close');
        const aboutVersionRunning = document.getElementById('about-version-running');
        const aboutVersionLatest = document.getElementById('about-version-latest');
        const aboutVersionPending = document.getElementById('about-version-pending');
        const aboutRestoreStatus = document.getElementById('about-restore-status');

        const UPDATE_CHECK_INTERVAL_MS = 30 * 60 * 1000;
        const APPLY_TIMEOUT_MS = 8000;

        let applyRequested = false;
        let applyingUpdate = false;
        let reloadRecommended = false;
        let waitingWorker = null;
        let fallbackReloadTimer = null;
        let swRegistration = null;
        let updateCheckTimer = null;
        let hiddenToastBuildId = null;
        let latestRemoteBuildId = null;
        let pendingBuildId = null;
        let activeControllerBuildId = extractBuildIdFromWorker(navigator.serviceWorker.controller);
        let restoreStatus = (typeof window !== 'undefined' && window.__topobusRestoreStatus) || {
            status: 'idle',
            message: 'not attempted'
        };

        function extractBuildIdFromScriptUrl(scriptUrl) {
            if (!scriptUrl) return null;
            try {
                const url = new URL(scriptUrl, window.location.href);
                return (url.searchParams.get('build') || '').trim() || null;
            } catch {
                return null;
            }
        }

        function extractBuildIdFromWorker(worker) {
            if (!worker || !worker.scriptURL) return null;
            return extractBuildIdFromScriptUrl(worker.scriptURL);
        }

        function getActiveControllerBuildId() {
            const fromController = extractBuildIdFromWorker(navigator.serviceWorker.controller);
            if (fromController) {
                activeControllerBuildId = fromController;
                return fromController;
            }
            return activeControllerBuildId || null;
        }

        function formatBuildId(value, fallback = 'unknown') {
            return value && String(value).trim() ? String(value).trim() : fallback;
        }

        function formatBytes(size) {
            if (!Number.isFinite(size) || size < 0) return '';
            if (size < 1024) return `${size} B`;
            const kb = size / 1024;
            if (kb < 1024) return `${kb.toFixed(1)} KB`;
            const mb = kb / 1024;
            return `${mb.toFixed(1)} MB`;
        }

        function setToast({ visible, title, details, actionLabel = 'Reload', actionDisabled = false }) {
            if (!updateToast) return;
            if (updateToastTitle) {
                updateToastTitle.textContent = title || 'Update available';
            }
            if (updateToastDetails) {
                updateToastDetails.textContent = details || '';
            }
            if (updateToastReload) {
                updateToastReload.textContent = actionLabel;
                updateToastReload.disabled = !!actionDisabled;
            }
            updateToast.classList.toggle('hidden', !visible);
        }

        function setUpdateBadge(enabled) {
            if (!refreshBtn) return;
            refreshBtn.classList.toggle('update-available', !!enabled);
        }

        function setRefreshState({ hasPending = false, applying = false } = {}) {
            if (!refreshBtn) return;
            refreshBtn.disabled = !!applying;
            refreshBtn.classList.toggle('update-applying', !!applying);
            setUpdateBadge(!!hasPending || !!reloadRecommended);

            if (applying) {
                refreshBtn.title = 'Applying update...';
                return;
            }
            if (reloadRecommended) {
                refreshBtn.title = 'Reload required to finalize update';
                return;
            }
            if (hasPending) {
                refreshBtn.title = 'New version available - click to reload';
                return;
            }
            refreshBtn.title = 'Reload';
        }

        function updateHelpVersionInfo() {
            const running = getActiveControllerBuildId();
            if (aboutVersionRunning) {
                aboutVersionRunning.textContent = formatBuildId(running);
            }
            if (aboutVersionLatest) {
                aboutVersionLatest.textContent = formatBuildId(latestRemoteBuildId);
            }
            if (aboutVersionPending) {
                if (reloadRecommended) {
                    aboutVersionPending.textContent = 'reload required';
                } else {
                    aboutVersionPending.textContent = pendingBuildId
                        ? formatBuildId(pendingBuildId)
                        : 'none';
                }
            }
            if (aboutRestoreStatus) {
                aboutRestoreStatus.textContent = formatRestoreStatus(restoreStatus);
                aboutRestoreStatus.title = restoreStatus && restoreStatus.message
                    ? String(restoreStatus.message)
                    : '';
            }
        }

        function formatRestoreStatus(value) {
            const status = value && value.status ? String(value.status) : 'idle';
            if (status === 'restored') return 'restored';
            if (status === 'loading') return 'restoring...';
            if (status === 'none') return 'no saved project';
            if (status === 'failed') return 'failed';
            if (status === 'skipped') return 'skipped';
            return 'not attempted';
        }

        function handleRestoreStatusEvent(event) {
            const detail = event && event.detail ? event.detail : null;
            if (!detail || typeof detail !== 'object') return;
            restoreStatus = {
                status: detail.status || 'idle',
                message: detail.message || ''
            };
            updateHelpVersionInfo();
        }

        function isKnownRemoteUpdate() {
            const active = getActiveControllerBuildId();
            if (!latestRemoteBuildId || !active) return false;
            return latestRemoteBuildId !== active;
        }

        function rememberHiddenToast() {
            hiddenToastBuildId = pendingBuildId || (reloadRecommended ? '__reload_required__' : latestRemoteBuildId);
        }

        function shouldShowToastForCurrentState() {
            if (reloadRecommended) {
                return hiddenToastBuildId !== '__reload_required__';
            }
            if (!pendingBuildId) return true;
            return hiddenToastBuildId !== pendingBuildId;
        }

        function showUpdateAvailable(worker, reason = 'available') {
            reloadRecommended = false;
            waitingWorker = worker || waitingWorker;
            const fromWorker = extractBuildIdFromWorker(waitingWorker);
            const activeBuildId = getActiveControllerBuildId();
            if (fromWorker) {
                pendingBuildId = fromWorker;
            } else if (!pendingBuildId && isKnownRemoteUpdate()) {
                pendingBuildId = latestRemoteBuildId;
            }

            // Ignore false-positive updates where waiting/remote build equals current build.
            if (pendingBuildId && activeBuildId && pendingBuildId === activeBuildId) {
                waitingWorker = null;
                pendingBuildId = null;
                setRefreshState({ hasPending: false, applying: applyingUpdate });
                setToast({
                    visible: false,
                    title: '',
                    details: '',
                    actionLabel: 'Reload',
                    actionDisabled: false
                });
                updateHelpVersionInfo();
                return;
            }

            updateHelpVersionInfo();
            setRefreshState({ hasPending: true, applying: applyingUpdate });

            if (!shouldShowToastForCurrentState() || applyingUpdate) {
                return;
            }

            const active = formatBuildId(getActiveControllerBuildId());
            const pending = formatBuildId(pendingBuildId, 'new build');
            if (active !== 'unknown' && pending !== 'new build' && pending === active) {
                waitingWorker = null;
                pendingBuildId = null;
                setRefreshState({ hasPending: false, applying: applyingUpdate });
                setToast({
                    visible: false,
                    title: '',
                    details: '',
                    actionLabel: 'Reload',
                    actionDisabled: false
                });
                updateHelpVersionInfo();
                return;
            }
            const details = reason === 'downloading'
                ? `Detected ${pending}. Downloading update in background...`
                : `Current build ${active} → ${pending}`;
            setToast({
                visible: true,
                title: reason === 'downloading' ? 'Update detected' : 'Update ready',
                details,
                actionLabel: 'Reload',
                actionDisabled: false
            });
        }

        function clearPendingState() {
            waitingWorker = null;
            pendingBuildId = null;
            applyRequested = false;
            applyingUpdate = false;
            reloadRecommended = false;
            hiddenToastBuildId = null;
            setRefreshState({ hasPending: false, applying: false });
            setToast({
                visible: false,
                title: '',
                details: '',
                actionLabel: 'Reload',
                actionDisabled: false
            });
            updateHelpVersionInfo();
        }

        async function fetchRemoteBuildId() {
            try {
                const url = new URL('./build-id.txt', window.location.href);
                const res = await fetch(url.toString(), {
                    cache: 'no-store',
                    credentials: 'same-origin'
                });
                if (!res.ok) return null;
                const text = (await res.text()).trim();
                return text || null;
            } catch {
                return null;
            }
        }

        async function waitForWaitingWorker(registration, timeoutMs) {
            const deadline = Date.now() + timeoutMs;
            while (Date.now() < deadline) {
                if (registration.waiting) {
                    return registration.waiting;
                }
                await new Promise((resolve) => setTimeout(resolve, 250));
                await registration.update().catch(() => {});
            }
            return registration.waiting || null;
        }

        async function applyUpdate() {
            if (applyingUpdate) return;
            applyingUpdate = true;
            applyRequested = true;
            reloadRecommended = false;
            hiddenToastBuildId = null;
            setRefreshState({ hasPending: true, applying: true });
            setToast({
                visible: true,
                title: 'Applying update...',
                details: 'The app will reload once the new version is active.',
                actionLabel: 'Reload',
                actionDisabled: true
            });
            updateHelpVersionInfo();

            if (refreshBtn) {
                refreshBtn.disabled = true;
            }

            try {
                const registration = swRegistration || await navigator.serviceWorker.getRegistration();
                if (!registration) {
                    window.location.reload();
                    return;
                }
                swRegistration = registration;

                waitingWorker = registration.waiting || waitingWorker;
                if (!waitingWorker) {
                    await registration.update().catch(() => {});
                    waitingWorker = await waitForWaitingWorker(registration, 6000);
                }

                if (!waitingWorker) {
                    applyingUpdate = false;
                    applyRequested = false;
                    pendingBuildId = latestRemoteBuildId;
                    updateHelpVersionInfo();
                    setRefreshState({ hasPending: true, applying: false });
                    setToast({
                        visible: true,
                        title: 'Update still downloading',
                        details: 'The new version is not ready yet. Please retry in a few seconds.',
                        actionLabel: 'Retry',
                        actionDisabled: false
                    });
                    return;
                }

                const waitingBuild = extractBuildIdFromWorker(waitingWorker);
                if (waitingBuild) {
                    pendingBuildId = waitingBuild;
                }
                updateHelpVersionInfo();

                waitingWorker.postMessage({ type: 'SKIP_WAITING' });
                fallbackReloadTimer = window.setTimeout(() => {
                    window.location.reload();
                }, APPLY_TIMEOUT_MS);
            } catch (error) {
                console.warn('Failed to apply service worker update.', error);
                applyingUpdate = false;
                applyRequested = false;
                setRefreshState({ hasPending: true, applying: false });
                setToast({
                    visible: true,
                    title: 'Update failed',
                    details: 'Could not apply the update. Check your connection and retry.',
                    actionLabel: 'Retry',
                    actionDisabled: false
                });
            }
        }

        navigator.serviceWorker.addEventListener('controllerchange', () => {
            activeControllerBuildId = getActiveControllerBuildId() || activeControllerBuildId;
            waitingWorker = null;
            pendingBuildId = null;
            if (fallbackReloadTimer) {
                clearTimeout(fallbackReloadTimer);
                fallbackReloadTimer = null;
            }
            updateHelpVersionInfo();

            if (applyRequested) {
                window.location.reload();
                return;
            }

            applyingUpdate = false;
            reloadRecommended = true;
            setRefreshState({ hasPending: true, applying: false });
            if (shouldShowToastForCurrentState()) {
                setToast({
                    visible: true,
                    title: 'Update installed',
                    details: 'Another tab activated an update. Reload when you are ready.',
                    actionLabel: 'Reload',
                    actionDisabled: false
                });
            }
        });

        if (updateToastReload) {
            updateToastReload.addEventListener('click', async () => {
                if (reloadRecommended) {
                    window.location.reload();
                    return;
                }
                if (waitingWorker || pendingBuildId || isKnownRemoteUpdate()) {
                    await applyUpdate();
                    return;
                }
                window.location.reload();
            });
        }

        if (updateToastClose) {
            updateToastClose.addEventListener('click', () => {
                rememberHiddenToast();
                setToast({
                    visible: false,
                    title: '',
                    details: '',
                    actionLabel: 'Reload',
                    actionDisabled: false
                });
            });
        }

        if (refreshBtn) {
            refreshBtn.addEventListener('click', async () => {
                if (applyingUpdate) {
                    return;
                }

                if (reloadRecommended) {
                    window.location.reload();
                    return;
                }

                if (waitingWorker || pendingBuildId || isKnownRemoteUpdate()) {
                    await applyUpdate();
                    return;
                }

                try {
                    const registration = swRegistration || await navigator.serviceWorker.getRegistration();
                    if (!registration) {
                        window.location.reload();
                        return;
                    }
                    swRegistration = registration;
                    await registration.update().catch(() => {});
                    if (registration.waiting) {
                        showUpdateAvailable(registration.waiting, 'available');
                        await applyUpdate();
                        return;
                    }
                } catch (error) {
                    console.warn('Manual update check failed.', error);
                }

                window.location.reload();
            });
        }

        async function checkForUpdates({ notifyWhenDetected = false } = {}) {
            const remoteBuild = await fetchRemoteBuildId();
            if (remoteBuild) {
                latestRemoteBuildId = remoteBuild;
            }
            updateHelpVersionInfo();

            const registration = swRegistration || await navigator.serviceWorker.getRegistration().catch(() => null);
            if (!registration) {
                return;
            }
            swRegistration = registration;
            await registration.update().catch(() => {});

            if (registration.waiting) {
                showUpdateAvailable(registration.waiting, 'available');
                return;
            }

            if (!remoteBuild) {
                return;
            }

            if (!isKnownRemoteUpdate()) {
                if (!reloadRecommended && !waitingWorker && !applyingUpdate) {
                    clearPendingState();
                }
                return;
            }

            pendingBuildId = remoteBuild;
            setRefreshState({ hasPending: true, applying: applyingUpdate });
            updateHelpVersionInfo();

            if (notifyWhenDetected && shouldShowToastForCurrentState() && !applyingUpdate) {
                showUpdateAvailable(null, 'downloading');
            }
        }

        async function registerServiceWorker() {
            const buildId = await fetchRemoteBuildId();
            if (buildId) {
                latestRemoteBuildId = buildId;
            }
            const swUrl = buildId ? `./sw.js?build=${encodeURIComponent(buildId)}` : './sw.js';
            return navigator.serviceWorker.register(swUrl, { updateViaCache: 'none' });
        }

        updateHelpVersionInfo();
        setRefreshState({ hasPending: false, applying: false });
        window.addEventListener('topobus:restore-status', handleRestoreStatusEvent);
        if (isProjectFilePersistenceSupported()) {
            const meta = getStoredProjectMeta();
            if (meta && meta.name) {
                const size = formatBytes(Number(meta.size));
                console.info('[TopoBus] OPFS restore enabled for last project:', meta.name, size || '');
            } else {
                console.info('[TopoBus] OPFS restore enabled (no saved project yet).');
            }
        } else {
            console.info('[TopoBus] OPFS restore not supported by this browser.');
        }

        registerServiceWorker()
            .then(async (registration) => {
                swRegistration = registration;
                await registration.update().catch(() => {});

                const trackInstallingWorker = (worker) => {
                    if (!worker) return;
                    worker.addEventListener('statechange', () => {
                        if (worker.state === 'installed' && navigator.serviceWorker.controller) {
                            showUpdateAvailable(registration.waiting || worker, 'available');
                        }
                        if (worker.state === 'redundant') {
                            if (waitingWorker === worker) {
                                waitingWorker = null;
                            }
                            if (applyingUpdate) {
                                applyingUpdate = false;
                                applyRequested = false;
                                setRefreshState({ hasPending: true, applying: false });
                                setToast({
                                    visible: true,
                                    title: 'Update failed',
                                    details: 'The update was discarded by the browser. Please retry.',
                                    actionLabel: 'Retry',
                                    actionDisabled: false
                                });
                            }
                            updateHelpVersionInfo();
                        }
                    });
                };

                if (registration.waiting && navigator.serviceWorker.controller) {
                    showUpdateAvailable(registration.waiting, 'available');
                }

                registration.addEventListener('updatefound', () => {
                    trackInstallingWorker(registration.installing);
                });
                trackInstallingWorker(registration.installing);

                await checkForUpdates({ notifyWhenDetected: false });
                window.setTimeout(() => {
                    checkForUpdates({ notifyWhenDetected: true });
                }, 1500);
                updateCheckTimer = window.setInterval(() => {
                    checkForUpdates({ notifyWhenDetected: true });
                }, UPDATE_CHECK_INTERVAL_MS);
                window.addEventListener('online', () => {
                    checkForUpdates({ notifyWhenDetected: true });
                });
                document.addEventListener('visibilitychange', () => {
                    if (!document.hidden) {
                        checkForUpdates({ notifyWhenDetected: false });
                    }
                });
            })
            .catch((error) => {
                console.warn('Service worker registration failed:', error);
                if (updateCheckTimer) {
                    clearInterval(updateCheckTimer);
                    updateCheckTimer = null;
                }
            });
    });
}
