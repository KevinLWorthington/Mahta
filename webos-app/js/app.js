'use strict';

/* ================= paths ================= */

var CONFIG_PATH = '/home/root/.config/lginputhook/keybinds.json';
var LOG_PATH = '/tmp/lginput-hook-native.log';
var HOOK_SO = '/home/root/lginput-hook.so';
var ENV_FILE = '/var/systemd/system/env/lginput2.env';
var INIT_SCRIPT = '/var/lib/webosbrew/init.d/lginput-native-hook';
/* Directory this app is installed in (index.html lives at its root). */
var APP_DIR = decodeURIComponent(location.pathname).replace(/\/[^\/]*$/, '');

/* ================= state ================= */

var state = {
    view: 'status',
    config: { reload: '1' },   // keycode (string) -> binding, plus "reload"
    configLoaded: false,
    status: null,              // {so, env, init, run, cfg}
    apps: null,                // [{id, title}]
    busy: false,
    showProtected: false       // reveal nav/OK/Back/Power buttons (off each launch)
};

/* ================= tiny DOM helpers ================= */

function $(sel, root) { return (root || document).querySelector(sel); }
function $all(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

function el(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) {
        Object.keys(attrs).forEach(function (k) {
            if (k === 'text') node.textContent = attrs[k];
            else if (k === 'html') node.innerHTML = attrs[k];
            else if (k === 'onclick') node.addEventListener('click', attrs[k]);
            else node.setAttribute(k, attrs[k]);
        });
    }
    (children || []).forEach(function (c) { if (c) node.appendChild(c); });
    return node;
}

function btn(label, onActivate, cls) {
    var b = el('button', { 'class': 'btn focusable' + (cls ? ' ' + cls : ''), text: label, tabindex: '-1' });
    b.addEventListener('click', onActivate);
    return b;
}

/* Remote-navigable checkbox. */
function toggleControl(label, checked, onToggle) {
    var box = el('div', {
        'class': 'toggle focusable' + (checked ? ' on' : ''),
        tabindex: '-1', role: 'checkbox', 'aria-checked': checked ? 'true' : 'false'
    }, [
        el('span', { 'class': 'toggle-box', text: checked ? '✓' : '' }),
        el('span', { 'class': 'toggle-label', text: label })
    ]);
    box.addEventListener('click', onToggle);
    return box;
}

function setShowProtected(v) {
    state.showProtected = v;
    renderView();
    var t = $('.toggle');   // keep focus on the toggle across the re-render
    if (t) setFocus(t);
}

function toast(msg, isError) {
    var t = $('#toast');
    t.textContent = msg;
    t.className = 'show' + (isError ? ' error' : '');
    clearTimeout(toast._timer);
    toast._timer = setTimeout(function () { t.className = ''; }, 3500);
}

/* ================= spatial navigation ================= */

function navScope() {
    var modals = $all('.modal-overlay');
    return modals.length ? modals[modals.length - 1] : document.body;
}

function focusableIn(scope) {
    return $all('.focusable', scope).filter(function (n) {
        var r = n.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
    });
}

function focusFirst(scope) {
    var items = focusableIn(scope || navScope());
    if (items.length) setFocus(items[0]);
}

function setFocus(node) {
    if (!node) return;
    node.focus({ preventScroll: true });
    try {
        node.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    } catch (e) { /* older engines */ }
}

function center(rect) {
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

function moveFocus(dir) {
    var scope = navScope();
    var items = focusableIn(scope);
    if (!items.length) return;
    var cur = document.activeElement;
    if (!cur || items.indexOf(cur) === -1) { setFocus(items[0]); return; }

    var c = center(cur.getBoundingClientRect());
    var best = null, bestScore = Infinity;
    items.forEach(function (n) {
        if (n === cur) return;
        var p = center(n.getBoundingClientRect());
        var dx = p.x - c.x, dy = p.y - c.y;
        var primary, ortho;
        if (dir === 'left')       { primary = -dx; ortho = Math.abs(dy); }
        else if (dir === 'right') { primary = dx;  ortho = Math.abs(dy); }
        else if (dir === 'up')    { primary = -dy; ortho = Math.abs(dx); }
        else                      { primary = dy;  ortho = Math.abs(dx); }
        if (primary < 4) return; // not in that direction
        var score = primary + ortho * 2.5;
        if (score < bestScore) { bestScore = score; best = n; }
    });
    if (best) setFocus(best);
}

/*
 * Activate a focusable like a click. SVG elements (the on-screen remote
 * buttons) have no .click() method, so fall back to a synthetic click event.
 */
function activate(node) {
    if (!node || !node.classList || !node.classList.contains('focusable')) return false;
    if (typeof node.click === 'function') {
        node.click();
        return true;
    }
    var ev;
    try {
        ev = new MouseEvent('click', { bubbles: true, cancelable: true });
    } catch (e) {
        ev = document.createEvent('MouseEvents');
        ev.initMouseEvent('click', true, true, window, 0, 0, 0, 0, 0, false, false, false, false, 0, null);
    }
    node.dispatchEvent(ev);
    return true;
}

document.addEventListener('keydown', function (e) {
    var k = e.keyCode;
    if (k === 37) { moveFocus('left'); e.preventDefault(); }
    else if (k === 38) { moveFocus('up'); e.preventDefault(); }
    else if (k === 39) { moveFocus('right'); e.preventDefault(); }
    else if (k === 40) { moveFocus('down'); e.preventDefault(); }
    else if (k === 13) {
        if (activate(document.activeElement)) e.preventDefault();
    } else if (k === 461 || k === 27) { // webOS BACK / Esc
        e.preventDefault();
        onBack();
    }
});

/* Magic-remote pointer: hovering focuses, clicking activates natively. */
document.addEventListener('mouseover', function (e) {
    var n = e.target;
    while (n && n !== document.body) {
        if (n.classList && n.classList.contains('focusable')) { n.focus({ preventScroll: true }); return; }
        n = n.parentNode;
    }
});

function onBack() {
    var modals = $all('.modal-overlay');
    if (modals.length) {
        var m = modals[modals.length - 1];
        if (m._onclose) m._onclose();
        m.parentNode.removeChild(m);
        focusFirst();
        return;
    }
    if (state.view !== 'status') {
        switchView('status');
    } else {
        window.close();
    }
}

/* ================= modal ================= */

function openModal(title, bodyNodes, onclose) {
    var overlay = el('div', { 'class': 'modal-overlay' });
    overlay._onclose = onclose || null;
    var box = el('div', { 'class': 'modal' }, [
        el('h2', { text: title })
    ]);
    bodyNodes.forEach(function (n) { box.appendChild(n); });
    overlay.appendChild(box);
    document.body.appendChild(overlay);
    focusFirst(overlay);
    return overlay;
}

function closeModal(overlay) {
    if (!overlay || !overlay.parentNode) return;
    if (overlay._onclose) overlay._onclose();
    overlay.parentNode.removeChild(overlay);
    focusFirst();
}

/* ================= config load/save ================= */

function parseConfigText(text) {
    // The hook's parser tolerates '#' comments; strip them so JSON.parse can cope.
    var clean = text.split('\n').map(function (line) {
        return line.replace(/#.*$/, '');
    }).join('\n').replace(/,\s*([}\]])/g, '$1').trim();
    if (!clean) return { reload: '1' };
    return JSON.parse(clean);
}

function loadConfig() {
    return Luna.exec("cat '" + CONFIG_PATH + "' 2>/dev/null || echo '{}'").then(function (r) {
        if (!r.ok) throw new Error(r.stderr);
        try {
            state.config = parseConfigText(r.stdout);
        } catch (e) {
            toast('Config file is not valid JSON — starting from empty. Saving will overwrite it.', true);
            state.config = {};
        }
        if (state.config.reload === undefined) state.config.reload = '1';
        state.configLoaded = true;
    });
}

function saveConfig() {
    var out = {};
    Object.keys(state.config)
        .filter(function (k) { return /^\d+$/.test(k); })
        .sort(function (a, b) { return a - b; })
        .forEach(function (k) { out[k] = state.config[k]; });
    // A changed reload value changes the file size, which triggers the hook's auto-reload.
    var n = parseInt(state.config.reload, 10);
    out.reload = String(isNaN(n) ? 1 : n + 1);
    state.config = out;
    var text = JSON.stringify(out, null, 4) + '\n';
    return Luna.writeFile(CONFIG_PATH, text).then(function (r) {
        if (!r.ok) {
            toast('Save failed: ' + r.stderr, true);
            return false;
        }
        toast('Saved — change is live.');
        return true;
    });
}

function bindingFor(code) {
    return state.config[String(code)] || null;
}

function describeBinding(b) {
    if (!b) return 'Default';
    if (b.action === 'disable') return 'Disabled';
    if (b.action === 'replace') return 'Sends ' + keyLabel(b.keycode);
    if (b.action === 'launch') return 'Launches ' + (appTitle(b.id) || b.id);
    return b.action;
}

function bindingClass(b) {
    if (!b) return '';
    if (b.action === 'disable') return 'map-disable';
    if (b.action === 'replace') return 'map-replace';
    if (b.action === 'launch') return 'map-launch';
    return '';
}

/* ================= status / install ================= */

var STATUS_CMD =
    'S1=no; [ -f ' + HOOK_SO + ' ] && S1=yes; ' +
    'S2=no; grep -q lginput-hook ' + ENV_FILE + ' 2>/dev/null && S2=yes; ' +
    'S3=no; [ -f ' + INIT_SCRIPT + ' ] && S3=yes; ' +
    'S4=no; pgrep lginput2 >/dev/null 2>&1 && S4=yes; ' +
    'S5=no; [ -f ' + CONFIG_PATH + ' ] && S5=yes; ' +
    'echo "so=$S1 env=$S2 init=$S3 run=$S4 cfg=$S5"';

function loadStatus() {
    return Luna.exec(STATUS_CMD).then(function (r) {
        if (!r.ok) {
            state.status = { error: r.stderr };
            return;
        }
        var s = {};
        (r.stdout.match(/\w+=\w+/g) || []).forEach(function (pair) {
            var kv = pair.split('=');
            s[kv[0]] = kv[1] === 'yes';
        });
        state.status = s;
    });
}

function hookInstalled() {
    var s = state.status;
    return s && s.so && s.init;
}

function hookActive() {
    var s = state.status;
    return s && s.so && s.env && s.run;
}

function runScript(label, command, outputBox) {
    state.busy = true;
    outputBox.textContent = label + '...\n';
    return Luna.exec(command).then(function (r) {
        state.busy = false;
        outputBox.textContent += (r.stdout || '') + (r.stderr ? '\n' + r.stderr : '');
        outputBox.textContent += r.ok ? '\n[done]' : '\n[FAILED]';
        outputBox.scrollTop = outputBox.scrollHeight;
        return loadStatus();
    }).then(function () {
        renderView();
    });
}

/* ================= apps list ================= */

function loadApps(force) {
    if (state.apps && !force) return Promise.resolve();
    var cmd = "luna-send -n 1 'luna://com.webos.applicationManager/listApps' '{}'";
    return Luna.exec(cmd).then(function (r) {
        if (!r.ok) throw new Error(r.stderr || 'listApps failed');
        var start = r.stdout.indexOf('{');
        if (start < 0) throw new Error('Unexpected listApps output');
        var data = JSON.parse(r.stdout.slice(start));
        var apps = (data.apps || []).map(function (a) {
            return {
                id: a.id,
                title: a.title || a.id,
                visible: a.visible !== false
            };
        });
        apps.sort(function (a, b) {
            if (a.visible !== b.visible) return a.visible ? -1 : 1;
            return a.title.localeCompare(b.title);
        });
        state.apps = apps;
    });
}

function appTitle(id) {
    if (!state.apps) return null;
    for (var i = 0; i < state.apps.length; i++) {
        if (state.apps[i].id === id) return state.apps[i].title;
    }
    return null;
}

/* ================= views ================= */

var VIEWS = [
    { id: 'status',  label: 'Status & Install' },
    { id: 'remote',  label: 'Remote' },
    { id: 'buttons', label: 'Button List' },
    { id: 'apps',    label: 'Apps' }
];

function switchView(id) {
    state.view = id;
    renderSidebar();
    renderView();
}

function renderSidebar() {
    var nav = $('#sidebar-nav');
    nav.innerHTML = '';
    VIEWS.forEach(function (v) {
        var item = el('div', {
            'class': 'nav-item focusable' + (state.view === v.id ? ' active' : ''),
            tabindex: '-1',
            text: v.label
        });
        item.addEventListener('click', function () { switchView(v.id); });
        nav.appendChild(item);
    });
}

function renderView() {
    var c = $('#content');
    c.innerHTML = '';
    if (state.view === 'status') renderStatusView(c);
    else if (state.view === 'remote') renderRemoteView(c);
    else if (state.view === 'buttons') renderButtonsView(c);
    else if (state.view === 'apps') renderAppsView(c);
    if (!document.activeElement || document.activeElement === document.body) focusFirst();
}

/* ---------- status view ---------- */

function statusRow(label, ok, okText, badText) {
    return el('div', { 'class': 'status-row' }, [
        el('span', { 'class': 'status-label', text: label }),
        el('span', { 'class': 'status-pill ' + (ok ? 'good' : 'bad'), text: ok ? okText : badText })
    ]);
}

function renderStatusView(c) {
    var s = state.status || {};
    c.appendChild(el('h1', { text: 'Hook Status' }));

    if (s.error) {
        c.appendChild(el('p', { 'class': 'error-text', text: 'Could not reach the Homebrew Channel root service: ' + s.error }));
        c.appendChild(el('p', { 'class': 'hint', text: 'Make sure the Homebrew Channel is installed and the TV is rooted.' }));
    }

    var grid = el('div', { 'class': 'status-grid' }, [
        statusRow('Hook library (' + HOOK_SO + ')', !!s.so, 'Installed', 'Not installed'),
        statusRow('Active (LD_PRELOAD on lginput2)', !!s.env, 'Active', 'Inactive'),
        statusRow('Boot persistence (init.d)', !!s.init, 'Enabled', 'Not set'),
        statusRow('lginput2 daemon', !!s.run, 'Running', 'Not running'),
        statusRow('Keybinds config', !!s.cfg, 'Present', 'Missing')
    ]);
    c.appendChild(grid);

    var outputBox = el('pre', { 'class': 'output-box', text: '' });
    var actions = el('div', { 'class': 'action-row' });

    if (!hookInstalled()) {
        actions.appendChild(btn('Install Hook', function () {
            runScript('Installing', "sh '" + APP_DIR + "/assets/install.sh' 2>&1", outputBox)
                .then(function () { return loadConfig(); });
        }, 'primary'));
    } else {
        actions.appendChild(btn('Reinstall Hook', function () {
            runScript('Reinstalling', "sh '" + APP_DIR + "/assets/install.sh' 2>&1", outputBox);
        }));
        actions.appendChild(btn('Uninstall Hook', function () { confirmUninstall(outputBox); }, 'danger'));
    }
    actions.appendChild(btn('Restart lginput2', function () {
        runScript('Restarting lginput2', 'systemctl restart lginput2 2>&1 && sleep 1 && pgrep lginput2 >/dev/null && echo OK', outputBox);
    }));
    actions.appendChild(btn('Refresh', function () {
        loadStatus().then(renderView);
    }));

    c.appendChild(actions);
    c.appendChild(el('h3', { text: 'Output' }));
    c.appendChild(outputBox);
    c.appendChild(el('p', { 'class': 'hint', text: 'Installing restarts the remote input daemon. The remote may be unresponsive for a second or two.' }));
}

function confirmUninstall(outputBox) {
    var overlay;
    var run = function (removeConfig) {
        closeModal(overlay);
        var answer = removeConfig ? 'y' : 'n';
        runScript('Uninstalling', "echo " + answer + " | sh '" + APP_DIR + "/assets/uninstall.sh' 2>&1", outputBox);
    };
    overlay = openModal('Uninstall hook?', [
        el('p', { text: 'This removes the hook and restores the remote to stock behavior.' }),
        el('div', { 'class': 'modal-actions' }, [
            btn('Uninstall, keep my keybinds', function () { run(false); }),
            btn('Uninstall and delete keybinds', function () { run(true); }, 'danger'),
            btn('Cancel', function () { closeModal(overlay); })
        ])
    ]);
}

/* ---------- remote view (SVG) ---------- */

var SVG_NS = 'http://www.w3.org/2000/svg';

function svgEl(tag, attrs) {
    var n = document.createElementNS(SVG_NS, tag);
    Object.keys(attrs || {}).forEach(function (k) { n.setAttribute(k, attrs[k]); });
    return n;
}

function renderRemoteView(c) {
    c.appendChild(el('h1', { text: 'Remote' }));
    var wrap = el('div', { 'class': 'remote-wrap' });

    var legend = el('div', { 'class': 'legend' }, [
        el('div', { 'class': 'legend-item', html: '<span class="dot map-disable"></span> Disabled' }),
        el('div', { 'class': 'legend-item', html: '<span class="dot map-replace"></span> Remapped to a key' }),
        el('div', { 'class': 'legend-item', html: '<span class="dot map-launch"></span> Launches an app' }),
        el('p', { 'class': 'hint', text: 'Select a button to change what it does. PTR SHOW / PTR HIDE are the pointer/cursor events.' })
    ]);

    var svg = svgEl('svg', { viewBox: REMOTE_VIEWBOX, 'class': 'remote-svg', preserveAspectRatio: 'xMidYMin meet' });

    // remote body
    svg.appendChild(svgEl('rect', { x: 8, y: 8, width: 344, height: 1134, rx: 60, 'class': 'remote-body' }));

    REMOTE_LAYOUT.forEach(function (item) {
        if (isProtected(item.code) && !state.showProtected) return;
        var g = svgEl('g', { 'class': 'rbtn focusable ' + (item.cls || ''), tabindex: '-1', 'data-code': item.code });
        var cx = item.x, cy = item.y;
        if (item.shape === 'pill') {
            g.appendChild(svgEl('rect', {
                x: cx - item.w / 2, y: cy - item.h / 2, width: item.w, height: item.h,
                rx: item.h / 2, 'class': 'rbtn-shape'
            }));
        } else {
            g.appendChild(svgEl('circle', { cx: cx, cy: cy, r: item.r, 'class': 'rbtn-shape' }));
        }
        if (item.icon) {
            var size = item.iconSize || 28;
            var scale = size / 24;
            var ig = svgEl('g', {
                transform: 'translate(' + (cx - size / 2) + ' ' + (cy - size / 2) + ') scale(' + scale + ')',
                'class': 'rbtn-icon'
            });
            ig.appendChild(svgEl('path', { d: item.icon }));
            g.appendChild(ig);
        } else if (item.label) {
            var t = svgEl('text', {
                x: cx, y: cy, 'text-anchor': 'middle', 'dominant-baseline': 'central',
                'class': 'rbtn-label' + (item.small ? ' small' : '')
            });
            t.textContent = item.label;
            g.appendChild(t);
        }
        // mapping indicator dot
        var b = bindingFor(item.code);
        if (b) {
            var dotX = item.shape === 'pill' ? cx + item.w / 2 - 6 : cx + (item.r || 20) * 0.78;
            var dotY = item.shape === 'pill' ? cy - item.h / 2 + 6 : cy - (item.r || 20) * 0.78;
            g.appendChild(svgEl('circle', { cx: dotX, cy: dotY, r: 8, 'class': 'map-dot ' + bindingClass(b) }));
        }
        g.addEventListener('click', function () { openMappingEditor(item.code); });
        g.addEventListener('focus', function () { showRemoteDetail(item.code); });
        svg.appendChild(g);
    });

    var toggle = toggleControl('Show navigation and power buttons.', state.showProtected, function () {
        setShowProtected(!state.showProtected);
    });

    var detail = el('div', { 'class': 'remote-detail', id: 'remote-detail' });
    var side = el('div', { 'class': 'remote-side' }, [toggle, legend, detail]);

    wrap.appendChild(svg);
    wrap.appendChild(side);
    c.appendChild(wrap);
}

function showRemoteDetail(code) {
    var d = $('#remote-detail');
    if (!d) return;
    var k = keyByCode(code);
    var b = bindingFor(code);
    d.innerHTML = '';
    d.appendChild(el('h3', { text: k ? k.name : 'Code ' + code }));
    d.appendChild(el('p', { 'class': 'mono', text: (k ? k.key + ' — ' : '') + 'code ' + code }));
    d.appendChild(el('p', { 'class': 'binding-desc ' + bindingClass(b), text: describeBinding(b) }));
    if (k && k.critical) d.appendChild(el('p', { 'class': 'hint', text: '⚠ Needed to navigate the TV — remap with care.' }));
}

/* ---------- buttons list view ---------- */

function renderButtonsView(c) {
    c.appendChild(el('h1', { text: 'Buttons & Codes' }));

    var head = el('div', { 'class': 'action-row' }, []);
    head.appendChild(btn('Identify a button (press it on the remote)', openDetector, 'primary'));
    c.appendChild(head);

    var list = el('div', { 'class': 'button-list' });

    // known keys plus any extra codes already present in the config
    var codes = KEYMAP.map(function (k) { return k.code; });
    Object.keys(state.config).forEach(function (k) {
        if (/^\d+$/.test(k) && codes.indexOf(parseInt(k, 10)) === -1) codes.push(parseInt(k, 10));
    });

    var hidden = 0;
    codes.forEach(function (code) {
        if (isProtected(code) && !state.showProtected) { hidden++; return; }
        var k = keyByCode(code);
        var b = bindingFor(code);
        var row = el('div', { 'class': 'list-row focusable', tabindex: '-1' }, [
            el('span', { 'class': 'cell name', text: k ? k.name : 'Unknown button' }),
            el('span', { 'class': 'cell mono code', text: String(code) }),
            el('span', { 'class': 'cell mono key', text: k ? k.key : '—' }),
            el('span', { 'class': 'cell mapping ' + bindingClass(b), text: describeBinding(b) })
        ]);
        row.addEventListener('click', function () { openMappingEditor(code); });
        list.appendChild(row);
    });
    c.appendChild(list);
    if (hidden) {
        c.appendChild(el('p', { 'class': 'hint', text: hidden + ' protected button(s) (navigation, OK, Back, Power) are hidden. Enable “Show navigation, OK, Back & Power buttons” on the Remote screen to edit them.' }));
    }
}

/* live key-code detector: tails the hook log for new KEY lines */
function openDetector() {
    if (!hookActive()) {
        toast('The hook must be installed and active to detect key codes.', true);
        return;
    }
    var seen = el('div', { 'class': 'detected-keys', text: 'Waiting for a button press…' });
    var startLine = 0;
    var timer = null;
    var overlay = openModal('Identify a button', [
        el('p', { text: 'Press any button on the remote. Its code will appear at the top of the list below.' }),
        seen,
        el('div', { 'class': 'modal-actions' }, [
            btn('Close', function () { closeModal(overlay); })
        ])
    ], function () { clearInterval(timer); });

    Luna.exec("wc -l < '" + LOG_PATH + "' 2>/dev/null || echo 0").then(function (r) {
        startLine = parseInt(r.stdout, 10) || 0;
        timer = setInterval(function () {
            Luna.exec("tail -n +" + (startLine + 1) + " '" + LOG_PATH + "' 2>/dev/null | grep 'KEY code=' | tail -n 12").then(function (r2) {
                if (!r2.ok) return;
                var codes = [];
                (r2.stdout.match(/KEY code=(\d+)/g) || []).forEach(function (m) {
                    var code = parseInt(m.replace('KEY code=', ''), 10);
                    if (codes[codes.length - 1] !== code) codes.push(code);
                });
                if (!codes.length) return;
                seen.innerHTML = '';
                codes.slice(-6).reverse().forEach(function (code) {
                    var k = keyByCode(code);
                    var row = el('div', { 'class': 'detected-row focusable', tabindex: '-1', text: (k ? k.name : 'Unknown') + ' — code ' + code });
                    row.addEventListener('click', function () {
                        closeModal(overlay);
                        openMappingEditor(code);
                    });
                    seen.appendChild(row);
                });
            });
        }, 1000);
    });
}

/* ---------- apps view ---------- */

function renderAppsView(c) {
    c.appendChild(el('h1', { text: 'Installed Apps' }));
    if (!state.apps) {
        c.appendChild(el('p', { text: 'Loading apps…' }));
        loadApps().then(renderView, function (e) {
            c.innerHTML = '';
            c.appendChild(el('p', { 'class': 'error-text', text: 'Could not list apps: ' + e.message }));
        });
        return;
    }
    c.appendChild(el('p', { 'class': 'hint', text: 'These app IDs can be assigned to buttons. Select one to test-launch it.' }));
    var list = el('div', { 'class': 'button-list' });
    state.apps.forEach(function (a) {
        var row = el('div', { 'class': 'list-row focusable' + (a.visible ? '' : ' dim'), tabindex: '-1' }, [
            el('span', { 'class': 'cell name', text: a.title }),
            el('span', { 'class': 'cell mono appid', text: a.id })
        ]);
        row.addEventListener('click', function () {
            Luna.exec("luna-send -n 1 'luna://com.webos.applicationManager/launch' '{\"id\":\"" + a.id + "\"}'")
                .then(function (r) { toast(r.ok ? 'Launched ' + a.title : 'Launch failed', !r.ok); });
        });
        list.appendChild(row);
    });
    c.appendChild(list);
}

/* ---------- mapping editor ---------- */

function openMappingEditor(code) {
    var k = keyByCode(code);
    var current = bindingFor(code);
    var name = k ? k.name : 'Unknown button';

    function choose(makeBinding) {
        if (k && k.critical) {
            confirmCritical(name, function () { apply(makeBinding); });
        } else {
            apply(makeBinding);
        }
    }

    function apply(makeBinding) {
        var b = makeBinding();
        if (b === undefined) return; // sub-picker will call applyBinding itself
        applyBinding(code, b);
    }

    var rows = [
        el('p', { 'class': 'mono', text: (k ? k.key + ' — ' : '') + 'code ' + code }),
        el('p', { 'class': 'binding-desc ' + bindingClass(current), text: 'Current: ' + describeBinding(current) })
    ];

    var overlay;
    var options = el('div', { 'class': 'option-list' }, [
        optionRow('Default', 'Stock TV behavior', !current, function () {
            closeModal(overlay); choose(function () { return null; });
        }),
        optionRow('Disable', 'Button does nothing', current && current.action === 'disable', function () {
            closeModal(overlay); choose(function () { return { action: 'disable' }; });
        }),
        optionRow('Send a different key', 'Replace with another button\'s key code', current && current.action === 'replace', function () {
            closeModal(overlay);
            openKeyPicker(name, function (replCode) {
                if (k && k.critical) confirmCritical(name, function () { applyBinding(code, { action: 'replace', keycode: replCode }); });
                else applyBinding(code, { action: 'replace', keycode: replCode });
            });
        }),
        optionRow('Launch an app', 'Open an app when pressed', current && current.action === 'launch', function () {
            closeModal(overlay);
            openAppPicker(name, function (appId) {
                if (k && k.critical) confirmCritical(name, function () { applyBinding(code, { action: 'launch', id: appId }); });
                else applyBinding(code, { action: 'launch', id: appId });
            });
        })
    ]);
    rows.push(options);
    if (k && k.critical) {
        rows.push(el('p', { 'class': 'hint', text: '⚠ This button is needed to navigate the TV. Remapping it can lock you out of menus (including this app).' }));
    }
    rows.push(el('div', { 'class': 'modal-actions' }, [btn('Cancel', function () { closeModal(overlay); })]));

    overlay = openModal(name, rows);
}

function optionRow(title, desc, selected, onpick) {
    var row = el('div', { 'class': 'option-row focusable' + (selected ? ' selected' : ''), tabindex: '-1' }, [
        el('div', { 'class': 'option-title', text: title }),
        el('div', { 'class': 'option-desc', text: desc })
    ]);
    row.addEventListener('click', onpick);
    return row;
}

function confirmCritical(name, onConfirm) {
    var overlay = openModal('Remap "' + name + '"?', [
        el('p', { text: 'This button is used to navigate the TV. If you remap it you may not be able to use menus or this app with the remote. You will need to SSH into your TV to fix the hook.' }),
        el('div', { 'class': 'modal-actions' }, [
            btn('I understand, remap it', function () { closeModal(overlay); onConfirm(); }, 'danger'),
            btn('Cancel', function () { closeModal(overlay); })
        ])
    ]);
}

function openKeyPicker(forName, onPick) {
    var overlay;
    var list = el('div', { 'class': 'option-list' });
    KEYMAP.filter(function (k) { return !k.virtual; }).forEach(function (k) {
        var row = optionRow(k.name, k.key + ' — code ' + k.code, false, function () {
            closeModal(overlay);
            onPick(k.code);
        });
        list.appendChild(row);
    });
    overlay = openModal('Send which key when "' + forName + '" is pressed?', [
        list,
        el('div', { 'class': 'modal-actions' }, [btn('Cancel', function () { closeModal(overlay); })])
    ]);
}

function openAppPicker(forName, onPick) {
    var overlay = openModal('Launch which app from "' + forName + '"?', [
        el('p', { text: 'Loading apps…' })
    ]);
    loadApps().then(function () {
        var box = overlay.querySelector('.modal');
        box.innerHTML = '';
        box.appendChild(el('h2', { text: 'Launch which app from "' + forName + '"?' }));
        var list = el('div', { 'class': 'option-list' });
        state.apps.forEach(function (a) {
            list.appendChild(optionRow(a.title, a.id, false, function () {
                closeModal(overlay);
                onPick(a.id);
            }));
        });
        box.appendChild(list);
        box.appendChild(el('div', { 'class': 'modal-actions' }, [btn('Cancel', function () { closeModal(overlay); })]));
        focusFirst(overlay);
    }, function (e) {
        var box = overlay.querySelector('.modal');
        box.appendChild(el('p', { 'class': 'error-text', text: 'Could not list apps: ' + e.message }));
    });
}

function applyBinding(code, binding) {
    if (binding === null) delete state.config[String(code)];
    else state.config[String(code)] = binding;
    saveConfig().then(function () { renderView(); });
}

/* ================= boot ================= */

function init() {
    renderSidebar();
    $('#content').appendChild(el('p', { text: 'Connecting to TV services…' }));
    Promise.all([
        loadStatus(),
        loadConfig().catch(function (e) {
            toast('Could not read config: ' + e.message, true);
        })
    ]).then(function () {
        renderView();
        loadApps().catch(function () { /* fetched lazily later if this fails */ });
    });
}

window.addEventListener('load', init);
