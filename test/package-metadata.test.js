'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const appInfo = require('../webos-app/appinfo.json');

test('app package version is bumped for C5 layout and capture serialization fixes', () => {
    assert.equal(appInfo.id, 'org.kevinlworthington.lginputhook');
    assert.equal(appInfo.version, '0.9.5');
});
