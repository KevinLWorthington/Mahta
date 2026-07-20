'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const search = require('../webos-app/js/search.js');

test('empty searches include every item', () => {
    assert.equal(search.matchesSearch('', ['Play', 'KEY_PLAY', 207]), true);
    assert.equal(search.matchesSearch('   ', ['Play', 'KEY_PLAY', 207]), true);
});

test('button searches match names, key symbols, and numeric codes', () => {
    const fields = ['Play', 'KEY_PLAY', 207];

    assert.equal(search.matchesSearch('play', fields), true);
    assert.equal(search.matchesSearch('KEY_PLAY', fields), true);
    assert.equal(search.matchesSearch('207', fields), true);
    assert.equal(search.matchesSearch('pause', fields), false);
});

test('search is case-insensitive and requires every query term', () => {
    const fields = ['Rakuten TV', 'KEY_RAKUTEN', 1044];

    assert.equal(search.matchesSearch('RAKUTEN 1044', fields), true);
    assert.equal(search.matchesSearch('rakuten 207', fields), false);
});

test('app searches match titles and application IDs', () => {
    const fields = ['Prime Video', 'com.webos.app.amazon'];

    assert.equal(search.matchesSearch('prime', fields), true);
    assert.equal(search.matchesSearch('amazon', fields), true);
    assert.equal(search.matchesSearch('video amazon', fields), true);
});
