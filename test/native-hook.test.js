'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

test('capture files are trusted safely and held repeats are swallowed', () => {
    const output = path.join(os.tmpdir(), `mahta-native-hook-test-${process.pid}`);
    const compile = spawnSync(process.env.CC || 'cc', [
        '-std=c99',
        '-D_GNU_SOURCE',
        '-o', output,
        path.join(__dirname, 'native-hook-capture.c')
    ], { encoding: 'utf8' });

    assert.equal(compile.status, 0, compile.stderr);
    try {
        const run = spawnSync(output, [], { encoding: 'utf8', timeout: 5000 });
        assert.equal(run.status, 0, run.stderr);
    } finally {
        fs.rmSync(output, { force: true });
    }
});
