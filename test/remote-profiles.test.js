'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const keymap = require('../webos-app/js/keymap.js');

test('defaults to the existing MR23 profile', () => {
    keymap.setActiveRemoteProfile('mr23');

    assert.equal(keymap.activeRemoteProfileId(), 'mr23');
    assert.equal(keymap.keyByCode(1107).name, 'Sling TV');
    assert.ok(keymap.profileKeymap().some((key) => key.code === 1107));
});

test('C5 Europe profile exposes regional shortcut keys without MR23-only Sling', () => {
    keymap.setActiveRemoteProfile('c5_eu');
    const profileCodes = keymap.profileKeymap().map((key) => key.code);
    const layout = keymap.remoteLayout();
    const layoutCodes = layout.map((button) => button.code);
    const digitCodes = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11];

    assert.ok(profileCodes.includes(1081));
    assert.ok(profileCodes.includes(1023));
    assert.ok(profileCodes.includes(994));
    assert.ok(profileCodes.includes(1037));
    assert.ok(profileCodes.includes(1038));
    assert.ok(profileCodes.includes(1042));
    assert.ok(profileCodes.includes(1043));
    assert.ok(profileCodes.includes(1044));
    assert.ok(profileCodes.includes(1086));
    assert.equal(profileCodes.includes(241), false);
    assert.equal(profileCodes.includes(113), false);
    assert.equal(profileCodes.includes(1083), false);
    assert.equal(profileCodes.includes(1107), false);
    assert.deepEqual(profileCodes.filter((code) => digitCodes.includes(code)), []);
    assert.deepEqual(layoutCodes.filter((code) => digitCodes.includes(code)), []);
    assert.equal(keymap.keyByCode(1044).name, 'Rakuten TV');
    assert.deepEqual(profileCodes.filter((code) => !layoutCodes.includes(code)), []);
    assert.deepEqual(
        layout.filter((button) => button.y <= 240).map((button) => button.code),
        [116, 1081, 1023, 362, 773, 428, 994]
    );
    assert.deepEqual(
        layout.filter((button) => button.code === 1044).map((button) => [button.x, button.y, button.label]),
        [[252, 858, 'RAKUTEN']]
    );
});

test('profile fallback keeps existing config-only codes editable', () => {
    keymap.setActiveRemoteProfile('c5_eu');

    assert.equal(keymap.keyByCode(1107).name, 'Sling TV');
    assert.equal(keymap.keyLabel(1107), 'Sling TV (1107)');
});

test('protected keys remain protected across profiles', () => {
    keymap.setActiveRemoteProfile('c5_eu');
    assert.equal(keymap.isProtected(28), true);
    assert.equal(keymap.isProtected(773), true);
    assert.equal(keymap.isProtected(1037), false);

    keymap.setActiveRemoteProfile('mr23');
    assert.equal(keymap.isProtected(28), true);
    assert.equal(keymap.isProtected(773), true);
});

test('all known remote keys are complete and independent of active profile', () => {
    keymap.setActiveRemoteProfile('mr23');
    const mr23Keys = keymap.allKnownRemoteKeys();
    keymap.setActiveRemoteProfile('c5_eu');
    const c5Keys = keymap.allKnownRemoteKeys();
    const codes = c5Keys.map((key) => key.code);

    assert.deepEqual(c5Keys, mr23Keys);
    assert.ok(codes.length >= 414);
    assert.ok(codes.includes(1044));
    assert.ok(codes.includes(1083));
    assert.ok(codes.includes(1107));
    assert.ok(codes.includes(1264));
    assert.equal(c5Keys.find((key) => key.code === 1264).ext, true);
});
