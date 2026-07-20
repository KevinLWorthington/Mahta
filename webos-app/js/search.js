'use strict';

function normalizeSearchText(value) {
    return String(value === undefined || value === null ? '' : value)
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim();
}

function matchesSearch(query, values) {
    var normalized = normalizeSearchText(query);
    if (!normalized) return true;

    var terms = normalized.split(' ');
    var haystack = (Array.isArray(values) ? values : [values])
        .map(normalizeSearchText)
        .join(' ');

    return terms.every(function (term) {
        return haystack.indexOf(term) !== -1;
    });
}

if (typeof module !== 'undefined') {
    module.exports = {
        normalizeSearchText: normalizeSearchText,
        matchesSearch: matchesSearch
    };
}
