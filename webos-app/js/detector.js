'use strict';

var CAPTURE_REQUEST_PATH = '/home/root/.config/lginputhook/capture-request';
var CAPTURE_TIMEOUT_SECONDS = 12;

function captureInstruction(state) {
    if (state === 'ready') return 'Capture is ready. Press one button on the remote.';
    if (state === 'captured') return 'Captured button:';
    if (state === 'inactive') return 'Capture is not active.';
    return 'Preparing secure capture. Please wait.';
}

function captureNowSeconds() {
    return Math.floor(Date.now() / 1000);
}

function makeCaptureToken(nowMs, randomValue) {
    var now = nowMs || Date.now();
    var randomPart = randomValue;
    if (randomPart === undefined) randomPart = Math.random().toString(36).slice(2);
    return 'mahta-' + now.toString(36) + '-' + String(randomPart).replace(/[^a-zA-Z0-9_-]/g, '');
}

function buildCaptureRequest(token, nowSeconds, ttlSeconds) {
    return token + ' ' + (nowSeconds + ttlSeconds) + '\n';
}

function parseCaptureLog(text, token) {
    var re = /CAPTURE token=([A-Za-z0-9_-]+) code=(\d+)/g;
    var match;
    var code = null;
    while ((match = re.exec(text || '')) !== null) {
        if (match[1] === token) code = parseInt(match[2], 10);
    }
    return code;
}

function buildCaptureCleanupCommand(token) {
    if (!/^[A-Za-z0-9_-]+$/.test(token)) throw new Error('invalid capture token');
    return "owner=''; IFS=' ' read -r owner _ 2>/dev/null < '" + CAPTURE_REQUEST_PATH + "' || true; " +
        "[ \"$owner\" != '" + token + "' ] || rm -f '" + CAPTURE_REQUEST_PATH + "'; true";
}

function createCaptureSession(options) {
    var stopped = false;
    var writeSettled = false;
    var cleanupFinalized = false;
    var interval = null;
    var timeout = null;
    var cleanupChain = Promise.resolve();
    var resolveDone;
    var done = new Promise(function (resolve) { resolveDone = resolve; });
    var setIntervalFn = options.setInterval || setInterval;
    var clearIntervalFn = options.clearInterval || clearInterval;
    var setTimeoutFn = options.setTimeout || setTimeout;
    var clearTimeoutFn = options.clearTimeout || clearTimeout;

    function queueRemoveRequest() {
        cleanupChain = cleanupChain.then(function () {
            var result;
            try {
                result = options.removeRequest();
            } catch (e) {
                return;
            }
            return Promise.resolve(result).then(function () {}, function () {});
        });
        return cleanupChain;
    }

    function finalizeCleanup() {
        if (cleanupFinalized) return;
        cleanupFinalized = true;
        queueRemoveRequest().then(resolveDone, resolveDone);
    }

    function stop() {
        if (stopped) return;
        stopped = true;
        if (interval !== null) clearIntervalFn(interval);
        if (timeout !== null) clearTimeoutFn(timeout);
        if (writeSettled) finalizeCleanup();
        else queueRemoveRequest();
    }

    function fail(message) {
        stop();
        options.onError(message);
    }

    function poll() {
        var result;
        if (stopped) return;
        try {
            result = options.poll();
        } catch (e) {
            return;
        }
        Promise.resolve(result).then(function (code) {
            if (stopped || code === null || code === undefined) return;
            stop();
            options.onCaptured(code);
        }, function () { /* transient polling failures are retried */ });
    }

    var session = {
        stop: stop,
        isStopped: function () { return stopped; },
        done: done
    };
    var writeResult;
    try {
        writeResult = options.writeRequest();
    } catch (e) {
        writeSettled = true;
        fail(e.message || String(e));
        return session;
    }

    Promise.resolve(writeResult).then(function (result) {
        writeSettled = true;
        if (stopped) {
            finalizeCleanup();
            return;
        }
        if (!result || !result.ok) {
            fail((result && result.stderr) || 'capture request failed');
            return;
        }
        options.onReady();
        if (stopped) {
            finalizeCleanup();
            return;
        }
        interval = setIntervalFn(poll, options.pollIntervalMs);
        timeout = setTimeoutFn(function () {
            if (stopped) return;
            stop();
            options.onTimeout();
        }, options.timeoutMs);
        poll();
    }, function (error) {
        writeSettled = true;
        if (stopped) {
            finalizeCleanup();
            return;
        }
        fail(error && error.message ? error.message : String(error));
    });

    return session;
}

function createCaptureCoordinator() {
    var activeSession = null;

    return {
        start: function (options) {
            if (activeSession) return null;
            var session = createCaptureSession(options);
            activeSession = session;
            session.done.then(function () {
                if (activeSession === session) activeSession = null;
            });
            return session;
        },
        isBusy: function () { return activeSession !== null; }
    };
}

if (typeof module !== 'undefined') {
    module.exports = {
        CAPTURE_REQUEST_PATH: CAPTURE_REQUEST_PATH,
        CAPTURE_TIMEOUT_SECONDS: CAPTURE_TIMEOUT_SECONDS,
        captureInstruction: captureInstruction,
        captureNowSeconds: captureNowSeconds,
        makeCaptureToken: makeCaptureToken,
        buildCaptureRequest: buildCaptureRequest,
        buildCaptureCleanupCommand: buildCaptureCleanupCommand,
        parseCaptureLog: parseCaptureLog,
        createCaptureSession: createCaptureSession,
        createCaptureCoordinator: createCaptureCoordinator
    };
}
