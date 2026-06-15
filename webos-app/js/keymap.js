'use strict';

/*
 * Key map for the MR23 Magic Remote (2023).
 * `critical` marks keys you need to drive the TV UI — remapping them gets a warning.
 * `virtual` marks codes that are not physical buttons (cursor show/hide events).
 */
var KEYMAP = [
    { code: 773,  name: 'Home',           key: 'KEY_HOME',          critical: true },
    { code: 2,    name: '1',              key: 'KEY_1' },
    { code: 3,    name: '2',              key: 'KEY_2' },
    { code: 4,    name: '3',              key: 'KEY_3' },
    { code: 5,    name: '4',              key: 'KEY_4' },
    { code: 6,    name: '5',              key: 'KEY_5' },
    { code: 7,    name: '6',              key: 'KEY_6' },
    { code: 8,    name: '7',              key: 'KEY_7' },
    { code: 9,    name: '8',              key: 'KEY_8' },
    { code: 10,   name: '9',              key: 'KEY_9' },
    { code: 11,   name: '0',              key: 'KEY_0' },
    { code: 994,  name: 'Screen Remote',  key: 'KEY_SCREEN_REMOTE' },
    { code: 362,  name: 'Guide',          key: 'KEY_GUIDE' },
    { code: 358,  name: 'Info',           key: 'KEY_INFO' },
    { code: 115,  name: 'Volume Up',      key: 'KEY_VOLUMEUP' },
    { code: 114,  name: 'Volume Down',    key: 'KEY_VOLUMEDOWN' },
    { code: 113,  name: 'Mute',           key: 'KEY_MUTE' },
    { code: 402,  name: 'Channel Up',     key: 'KEY_CHANNELUP' },
    { code: 403,  name: 'Channel Down',   key: 'KEY_CHANNELDOWN' },
    { code: 241,  name: 'Input',          key: 'KEY_INPUT' },
    { code: 428,  name: 'Voice',          key: 'RF_VOICE' },
    { code: 103,  name: 'Up',             key: 'KEY_UP',            critical: true },
    { code: 108,  name: 'Down',           key: 'KEY_DOWN',          critical: true },
    { code: 105,  name: 'Left',           key: 'KEY_LEFT',          critical: true },
    { code: 106,  name: 'Right',          key: 'KEY_RIGHT',         critical: true },
    { code: 28,   name: 'OK',             key: 'KEY_OK',            critical: true },
    { code: 412,  name: 'Back',           key: 'KEY_BACK',          critical: true },
    { code: 139,  name: 'Settings',       key: 'KEY_SETTINGS' },
    { code: 398,  name: 'Red',            key: 'KEY_RED' },
    { code: 399,  name: 'Green',          key: 'KEY_GREEN' },
    { code: 400,  name: 'Yellow',         key: 'KEY_YELLOW' },
    { code: 401,  name: 'Blue',           key: 'KEY_BLUE' },
    { code: 1037, name: 'Netflix',        key: 'KEY_NETFLIX' },
    { code: 1038, name: 'Prime Video',    key: 'KEY_AMAZON' },
    { code: 1042, name: 'Disney+',        key: 'KEY_DISNEY' },
    { code: 1043, name: 'LG Channels',    key: 'KEY_LGCHANNELS' },
    { code: 1086, name: 'Alexa',          key: 'KEY_ALEXAVOICE' },
    { code: 1107, name: 'Sling TV',       key: 'KEY_SLINGTV' },
    { code: 1198, name: 'Show Pointer',   key: 'KEY_CURSOR_SHOW',   virtual: true },
    { code: 1199, name: 'Hide Pointer',   key: 'KEY_CURSOR_HIDE',   virtual: true },
    { code: 116,  name: 'Power',          key: 'KEY_POWER',         critical: true },
    { code: 174,  name: 'Exit',           key: 'KEY_EXIT' },
    { code: 207,  name: 'Play',           key: 'KEY_PLAY' },
    { code: 119,  name: 'Pause',          key: 'KEY_PAUSE' },
    { code: 128,  name: 'Stop',           key: 'KEY_STOP' }
];

function keyByCode(code) {
    code = parseInt(code, 10);
    for (var i = 0; i < KEYMAP.length; i++) {
        if (KEYMAP[i].code === code) return KEYMAP[i];
    }
    // fall back to the full LG reference table for codes we don't curate
    if (typeof EXT_KEYMAP !== 'undefined' && EXT_KEYMAP[code]) {
        return { code: code, name: EXT_KEYMAP[code], key: EXT_KEYMAP[code], ext: true };
    }
    return null;
}

function keyLabel(code) {
    var k = keyByCode(code);
    return k ? (k.name + ' (' + code + ')') : ('code ' + code);
}

/*
 * Buttons hidden by default behind the "show navigation and power" toggle, to
 * avoid accidentally remapping the keys needed to drive the TV: the four
 * arrows, OK/Select, Back, Power, and Home)
 */
var PROTECTED_CODES = [103, 108, 105, 106, 28, 412, 116, 773];

function isProtected(code) {
    return PROTECTED_CODES.indexOf(parseInt(code, 10)) !== -1;
}

/*
 * SVG icon paths, hard-coded so as not to rely on 
 */
var ICONS = {
    // Material "mic"
    mic: 'M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5-3c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z',
    // Material "format_list_bulleted"; channel list / guide
    guide: 'M3 13h2v-2H3v2zm0 4h2v-2H3v2zm0-8h2V7H3v2zm4 4h14v-2H7v2zm0 4h14v-2H7v2zM7 7v2h14V7H7z',
    // Material "power settings new"
    power: 'M13 3h-2v10h2V3zm4.83 2.17l-1.42 1.42C17.99 7.86 19 9.81 19 12c0 3.87-3.13 7-7 7s-7-3.13-7-7c0-2.19 1.01-4.14 2.58-5.42L6.17 5.17C4.23 6.82 3 9.26 3 12c0 4.97 4.03 9 9 9s9-4.03 9-9c0-2.74-1.23-5.18-3.17-6.83z',
    // Material "settings"
    settings: 'M19.14 12.94c.04-.3.06-.61.06-.94c0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.488.488 0 0 0-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 0 0-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6s3.6 1.62 3.6 3.6s-1.62 3.6-3.6 3.6z'
};

/*
 * Visual layout of the on-screen remote (SVG coordinates).
 * shape: 'circle' (r), 'pill' (w/h rounded rect), 'tall' (rocker half)
 * A button shows `icon` (24x24 SVG path, sized by `iconSize`) if present,
 * otherwise its `label` text.
 */
var REMOTE_LAYOUT = [
    { code: 116,  x: 80,  y: 60,  shape: 'circle', r: 35, icon: ICONS.power, iconSize: 36, cls: 'power' },

    { code: 2,    x: 70,  y: 140,  shape: 'circle', r: 27, label: '1' },
    { code: 3,    x: 180, y: 140,  shape: 'circle', r: 27, label: '2' },
    { code: 4,    x: 290, y: 140,  shape: 'circle', r: 27, label: '3' },
    { code: 5,    x: 70,  y: 208,  shape: 'circle', r: 27, label: '4' },
    { code: 6,    x: 180, y: 208,  shape: 'circle', r: 27, label: '5' },
    { code: 7,    x: 290, y: 208,  shape: 'circle', r: 27, label: '6' },
    { code: 8,    x: 70,  y: 276,  shape: 'circle', r: 27, label: '7' },
    { code: 9,    x: 180, y: 276,  shape: 'circle', r: 27, label: '8' },
    { code: 10,   x: 290, y: 276,  shape: 'circle', r: 27, label: '9' },
    { code: 11,   x: 180, y: 344,  shape: 'circle', r: 27, label: '0' },
    
    { code: 362,  x: 70,  y: 344,  shape: 'circle', r: 27, icon: ICONS.guide, iconSize: 26 },
    
    { code: 994,  x: 290, y: 344,   shape: 'circle', r: 28, label: '···' },

    { code: 115,  x: 70,  y: 424,  shape: 'circle', r: 27, label: 'VOL+', small: true },
    { code: 114,  x: 70,  y: 500,  shape: 'circle', r: 27, label: 'VOL−', small: true },

    { code: 113,  x: 180, y: 424,  shape: 'circle', r: 27, label: 'MUTE', small: true },

    { code: 402,  x: 290, y: 424,  shape: 'circle', r: 27, label: 'CH+', small: true },
    { code: 403,  x: 290, y: 500,  shape: 'circle', r: 27, label: 'CH−', small: true },

    { code: 428,  x: 180, y: 500,  shape: 'circle', r: 28, icon: ICONS.mic, iconSize: 30, cls: 'mic' },

    { code: 773,  x: 70,  y: 598,   shape: 'circle', r: 28, label: 'HOME', small: true },

    { code: 241,  x: 290, y: 598,  shape: 'circle', r: 27, label: 'INPUT', small: true },
    
    { code: 139,  x: 290, y: 750,  shape: 'circle', r: 27, icon: ICONS.settings, iconSize: 26 },

    { code: 412,  x: 70,  y: 750,  shape: 'circle', r: 27, label: 'BACK', small: true },

    { code: 103,  x: 180, y: 598,  shape: 'circle', r: 26, label: '▲' },
    { code: 105,  x: 104, y: 674,  shape: 'circle', r: 26, label: '◀' },

    { code: 28,   x: 180, y: 674,  shape: 'circle', r: 34, label: 'OK', cls: 'ok' },

    { code: 106,  x: 256, y: 674,  shape: 'circle', r: 26, label: '▶' },
    { code: 108,  x: 180, y: 750,  shape: 'circle', r: 26, label: '▼' },

    { code: 398,  x: 56,  y: 856,  shape: 'pill', w: 75, h: 22, label: '', cls: 'c-red' },
    { code: 399,  x: 139, y: 856,  shape: 'pill', w: 75, h: 22, label: '', cls: 'c-green' },
    { code: 400,  x: 222, y: 856,  shape: 'pill', w: 75, h: 22, label: '', cls: 'c-yellow' },
    { code: 401,  x: 305, y: 856,  shape: 'pill', w: 75, h: 22, label: '', cls: 'c-blue' },

    { code: 1037, x: 96,  y: 916,  shape: 'pill', w: 132, h: 44, label: 'NETFLIX', small: true },
    { code: 1038, x: 252, y: 916,  shape: 'pill', w: 132, h: 44, label: 'PRIME', small: true },
    { code: 1042, x: 96,  y: 974,  shape: 'pill', w: 132, h: 44, label: 'DISNEY+', small: true },
    { code: 1043, x: 252, y: 974,  shape: 'pill', w: 132, h: 44, label: 'LG CH', small: true },
    { code: 1107, x: 96, y: 1032, shape: 'pill', w: 132, h: 44, label: 'SLING', small: true },
    { code: 1086, x: 252,  y: 1032, shape: 'pill', w: 132, h: 44, label: 'ALEXA', small: true },

    { code: 1198, x: 96,  y: 1096, shape: 'pill', w: 132, h: 40, label: 'PTR SHOW', small: true, cls: 'virt' },
    { code: 1199, x: 252, y: 1096, shape: 'pill', w: 132, h: 40, label: 'PTR HIDE', small: true, cls: 'virt' }
];

var REMOTE_VIEWBOX = '0 0 360 1150';
