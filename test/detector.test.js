'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const detector = require('../webos-app/js/detector.js');

test('capture tokens are shell-safe and deterministic when inputs are supplied', () => {
    assert.equal(detector.makeCaptureToken(1234567890, 'abc.123!'), 'mahta-kf12oi-abc123');
});

test('capture request uses token and absolute expiry only', () => {
    assert.equal(detector.buildCaptureRequest('mahta-token', 100, 12), 'mahta-token 112\n');
});

test('capture log parser returns the last matching code for the token', () => {
    const log = [
        'CAPTURE token=other code=773',
        'CAPTURE token=mahta-token code=1037',
        'KEY code=1037 value=1',
        'CAPTURE token=mahta-token code=1042'
    ].join('\n');

    assert.equal(detector.parseCaptureLog(log, 'mahta-token'), 1042);
});

test('capture log parser ignores unrelated tokens', () => {
    assert.equal(detector.parseCaptureLog('CAPTURE token=other code=773\n', 'mahta-token'), null);
});

test('capture request path cannot modify keybinds config', () => {
    assert.equal(detector.CAPTURE_REQUEST_PATH, '/home/root/.config/lginputhook/capture-request');
    assert.doesNotMatch(detector.CAPTURE_REQUEST_PATH, /^\/tmp\//);
    assert.doesNotMatch(detector.CAPTURE_REQUEST_PATH, /keybinds\.json/);
});

test('capture cleanup only removes a request owned by its token', () => {
    const command = detector.buildCaptureCleanupCommand('mahta-token');

    assert.match(command, /read -r owner/);
    assert.match(command, /2>\/dev\/null </);
    assert.match(command, /\[ "\$owner" != 'mahta-token' \] \|\| rm -f/);
    assert.throws(() => detector.buildCaptureCleanupCommand("bad'token"), /invalid capture token/);
});

test('Identify only invites a keypress after capture is ready', () => {
    assert.doesNotMatch(detector.captureInstruction('preparing'), /press/i);
    assert.match(detector.captureInstruction('ready'), /press/i);
    assert.doesNotMatch(detector.captureInstruction('inactive'), /press/i);
});

test('capture session does not report ready before the request write completes', async () => {
    let resolveWrite;
    const write = new Promise((resolve) => { resolveWrite = resolve; });
    let ready = false;

    const session = detector.createCaptureSession({
        writeRequest: () => write,
        removeRequest: () => {},
        poll: () => Promise.resolve(null),
        onReady: () => { ready = true; },
        onCaptured: () => assert.fail('unexpected capture'),
        onError: () => assert.fail('unexpected error'),
        onTimeout: () => assert.fail('unexpected timeout'),
        setInterval: () => 1,
        clearInterval: () => {},
        setTimeout: () => 2,
        clearTimeout: () => {},
        pollIntervalMs: 400,
        timeoutMs: 14000
    });

    assert.equal(ready, false);
    resolveWrite({ ok: true, stderr: '' });
    await Promise.resolve();
    await Promise.resolve();
    assert.equal(ready, true);
    session.stop();
    await session.done;
});

test('closing while the request write is pending never starts polling', async () => {
    let resolveWrite;
    const write = new Promise((resolve) => { resolveWrite = resolve; });
    let removals = 0;
    let intervals = 0;
    let polls = 0;

    const session = detector.createCaptureSession({
        writeRequest: () => write,
        removeRequest: () => { removals++; },
        poll: () => { polls++; return Promise.resolve(null); },
        onReady: () => assert.fail('closed session became ready'),
        onCaptured: () => assert.fail('closed session captured a key'),
        onError: () => assert.fail('closed session reported a write error'),
        onTimeout: () => assert.fail('closed session timed out'),
        setInterval: () => { intervals++; return 1; },
        clearInterval: () => {},
        setTimeout: () => 2,
        clearTimeout: () => {},
        pollIntervalMs: 400,
        timeoutMs: 14000
    });

    session.stop();
    resolveWrite({ ok: true, stderr: '' });
    await session.done;

    assert.equal(session.isStopped(), true);
    assert.equal(intervals, 0);
    assert.equal(polls, 0);
    assert.equal(removals, 2);
});

test('a new capture cannot start until stale pending-write cleanup finishes', async () => {
    let resolveWrite;
    const pendingWrite = new Promise((resolve) => { resolveWrite = resolve; });
    const coordinator = detector.createCaptureCoordinator();
    const baseOptions = {
        removeRequest: () => Promise.resolve(),
        poll: () => Promise.resolve(null),
        onReady: () => assert.fail('closed session became ready'),
        onCaptured: () => assert.fail('closed session captured a key'),
        onError: () => assert.fail('closed session reported an error'),
        onTimeout: () => assert.fail('closed session timed out'),
        setInterval: () => 1,
        clearInterval: () => {},
        setTimeout: () => 2,
        clearTimeout: () => {},
        pollIntervalMs: 400,
        timeoutMs: 14000
    };
    const first = coordinator.start(Object.assign({}, baseOptions, {
        writeRequest: () => pendingWrite
    }));

    first.stop();
    assert.equal(coordinator.isBusy(), true);
    assert.equal(coordinator.start(Object.assign({}, baseOptions, {
        writeRequest: () => Promise.resolve({ ok: true })
    })), null);

    resolveWrite({ ok: true, stderr: '' });
    await first.done;
    await Promise.resolve();
    assert.equal(coordinator.isBusy(), false);

    let secondReady = false;
    const second = coordinator.start(Object.assign({}, baseOptions, {
        writeRequest: () => Promise.resolve({ ok: true }),
        onReady: () => { secondReady = true; }
    }));
    await Promise.resolve();
    await Promise.resolve();
    assert.equal(secondReady, true);
    second.stop();
    await second.done;
});
