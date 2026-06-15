'use strict';

/*
 * Minimal Luna bus bridge + root shell helpers.
 *
 * Root command execution goes through Homebrew Channel's elevated service:
 *   luna://org.webosbrew.hbchannel.service/exec  {"command": "..."}
 * which is available on rooted TVs with the Homebrew Channel installed.
 */
var Luna = (function () {

    function call(uri, params) {
        return new Promise(function (resolve, reject) {
            var bridge;
            try {
                bridge = new PalmServiceBridge();
            } catch (e) {
                reject(new Error('PalmServiceBridge unavailable (not running on webOS?)'));
                return;
            }
            bridge.onservicecallback = function (raw) {
                var res;
                try {
                    res = JSON.parse(raw);
                } catch (e) {
                    reject(new Error('Unparseable Luna response: ' + raw));
                    return;
                }
                if (res.returnValue === false) {
                    var err = new Error(res.errorText || res.errorMessage || 'Luna call failed');
                    err.response = res;
                    reject(err);
                } else {
                    resolve(res);
                }
            };
            bridge.call(uri, JSON.stringify(params || {}));
        });
    }

    var HB_EXEC = 'luna://org.webosbrew.hbchannel.service/exec';

    /*
     * Run a shell command as root. Resolves with {ok, stdout, stderr}.
     * Never rejects — callers branch on .ok.
     */
    function exec(command) {
        return call(HB_EXEC, { command: command }).then(function (res) {
            return {
                ok: true,
                stdout: res.stdoutString || '',
                stderr: res.stderrString || ''
            };
        }, function (err) {
            var res = err.response || {};
            return {
                ok: false,
                stdout: res.stdoutString || '',
                stderr: res.stderrString || err.message || 'exec failed'
            };
        });
    }

    /* Write text to an absolute path as root (base64 round-trip avoids quoting issues). */
    function writeFile(path, text) {
        var b64 = btoa(unescape(encodeURIComponent(text)));
        var dir = path.replace(/\/[^\/]*$/, '');
        return exec("mkdir -p '" + dir + "' && echo '" + b64 + "' | base64 -d > '" + path + "'");
    }

    return { call: call, exec: exec, writeFile: writeFile };
})();
