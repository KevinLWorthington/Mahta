/*
 * lginput-hook.c
 * LD_PRELOAD hook for lginput2 on webOS 24 (9.x)
 *
 * Build:
 *   arm-linux-gnueabi-gcc -shared -fPIC -O2 -o lginput-hook.so lginput-hook.c \
 *       -nostartfiles -march=armv7-a \
 *       -Wl,--dynamic-linker=/lib/ld-linux.so.3
 *
 * Config: /home/root/.config/lginputhook/keybinds.json
 * {
 *   "1037": {"action": "disable"},
 *   "1038": {"action": "launch", "id": "youtube.leanback.v4"},
 *   "1042": {"action": "replace", "keycode": 102},
 *   "reload": "1"
 * }
 * Actions: "disable", "replace" (needs "keycode"), "launch" (needs "id")
 *
 * Revert:
 *   rm /var/systemd/system/env/lginput2.env && systemctl restart lginput2
 */

#include <stdarg.h>
#include <stdint.h>
#include <string.h>
#include <unistd.h>
#include <fcntl.h>
#include <sys/syscall.h>
#include <sys/wait.h>

/* ------------------------------------------------------------------ */
/* Raw ARM syscalls — zero glibc version dependencies                   */
/* ------------------------------------------------------------------ */
static ssize_t raw_write(int fd, const void *buf, size_t count) {
    register int        r0 __asm__("r0") = fd;
    register const void *r1 __asm__("r1") = buf;
    register size_t     r2 __asm__("r2") = count;
    register int        r7 __asm__("r7") = __NR_write;
    register ssize_t   res __asm__("r0");
    __asm__ __volatile__("swi #0"
        : "=r"(res) : "r"(r0),"r"(r1),"r"(r2),"r"(r7) : "memory");
    return res;
}

static int raw_fork(void) {
    register int r7 __asm__("r7") = __NR_fork;
    register int res __asm__("r0");
    __asm__ __volatile__("swi #0" : "=r"(res) : "r"(r7) : "memory");
    return res;
}

static int raw_execve(const char *path, char *const argv[], char *const envp[]) {
    register const char      *r0 __asm__("r0") = path;
    register char *const     *r1 __asm__("r1") = argv;
    register char *const     *r2 __asm__("r2") = envp;
    register int              r7 __asm__("r7") = __NR_execve;
    register int             res __asm__("r0");
    __asm__ __volatile__("swi #0"
        : "=r"(res) : "r"(r0),"r"(r1),"r"(r2),"r"(r7) : "memory");
    return res;
}

static void raw_exit(int code) {
    register int r0 __asm__("r0") = code;
    register int r7 __asm__("r7") = __NR_exit;
    __asm__ __volatile__("swi #0" : : "r"(r0),"r"(r7) : "memory");
}

/* ------------------------------------------------------------------ */
/* input_event (16 bytes on 32-bit ARM)                                 */
/* ------------------------------------------------------------------ */
typedef struct {
    uint32_t time_sec;
    uint32_t time_usec;
    uint16_t type;
    uint16_t code;
    int32_t  value;
} input_event_t;

#define EV_KEY 0x01
#define EV_REL 0x02

#define DISABLE_SCROLL_AND_POINTER 1

#define CONFIG_PATH "/home/root/.config/lginputhook/keybinds.json"
#define LOG_PATH    "/tmp/lginput-hook-native.log"
#define MAX_KEYBINDS 256
#define MAX_FDS       64
#define MAX_APP_ID    128

#define ACTION_PASS    0
#define ACTION_DISABLE 1
#define ACTION_REPLACE 2
#define ACTION_LAUNCH  3

typedef struct {
    int  keycode;
    int  action;
    int  replace_code;
    char app_id[MAX_APP_ID];
} keybind_t;

/* ------------------------------------------------------------------ */
/* State                                                                */
/* ------------------------------------------------------------------ */
static keybind_t g_keybinds[MAX_KEYBINDS];
static int       g_keybind_count   = 0;
static long      g_config_size     = -1;
static int       g_log_fd          = -1;
static int       g_uinput_fds[MAX_FDS];
static int       g_uinput_fd_count = 0;

static ssize_t (*real_write)(int, const void *, size_t) = NULL;

/* ------------------------------------------------------------------ */
/* Logging                                                              */
/* ------------------------------------------------------------------ */
static void hook_log(const char *msg) {
    if (g_log_fd < 0)
        g_log_fd = open(LOG_PATH, O_WRONLY | O_CREAT | O_APPEND, 0644);
    if (g_log_fd < 0) return;
    raw_write(g_log_fd, msg, strlen(msg));
    raw_write(g_log_fd, "\n", 1);
}

static void log_int(const char *prefix, int val) {
    char buf[80]; int n = 0;
    while (prefix[n]) { buf[n] = prefix[n]; n++; }
    char tmp[16]; int ti = 0, v = val < 0 ? -val : val;
    if (val < 0) buf[n++] = '-';
    if (v == 0) { buf[n++] = '0'; }
    else { while (v > 0) { tmp[ti++] = '0' + v % 10; v /= 10; }
           for (int i = ti-1; i >= 0; i--) buf[n++] = tmp[i]; }
    buf[n++] = '\n';
    if (g_log_fd < 0)
        g_log_fd = open(LOG_PATH, O_WRONLY | O_CREAT | O_APPEND, 0644);
    if (g_log_fd >= 0) raw_write(g_log_fd, buf, n);
}

/* ------------------------------------------------------------------ */
/* Safe integer parse                                                   */
/* ------------------------------------------------------------------ */
static int parse_int(const char *s) {
    int r = 0, sign = 1;
    if (!s) return 0;
    while (*s == ' ') s++;
    if (*s == '-') { sign = -1; s++; } else if (*s == '+') s++;
    while (*s >= '0' && *s <= '9') r = r * 10 + (*s++ - '0');
    return r * sign;
}

/* ------------------------------------------------------------------ */
/* File size via lseek — no stat()                                      */
/* ------------------------------------------------------------------ */
static long file_size(const char *path) {
    int fd = open(path, O_RDONLY);
    if (fd < 0) return -1;
    long sz = (long)lseek(fd, 0, SEEK_END);
    close(fd);
    return sz;
}

/* ------------------------------------------------------------------ */
/* JSON helpers                                                          */
/* ------------------------------------------------------------------ */
static void find_str(const char *json, const char *key,
                     char *out, int outlen) {
    out[0] = '\0';
    char search[64]; int n = 0;
    search[n++] = '"';
    for (int i = 0; key[i] && n < 62; i++) search[n++] = key[i];
    search[n++] = '"'; search[n] = '\0';
    const char *p = strstr(json, search);
    if (!p) return;
    p += n;
    while (*p == ' ' || *p == ':') p++;
    if (*p != '"') return;
    p++;
    int i = 0;
    while (*p && *p != '"' && i < outlen-1) out[i++] = *p++;
    out[i] = '\0';
}

static int find_int(const char *json, const char *key, int *out) {
    char search[64]; int n = 0;
    search[n++] = '"';
    for (int i = 0; key[i] && n < 62; i++) search[n++] = key[i];
    search[n++] = '"'; search[n] = '\0';
    const char *p = strstr(json, search);
    if (!p) return 0;
    p += n;
    while (*p == ' ' || *p == ':') p++;
    if ((*p < '0' || *p > '9') && *p != '-') return 0;
    *out = parse_int(p);
    return 1;
}

/* ------------------------------------------------------------------ */
/* App launcher — forks and runs luna-send without any glibc popen     */
/* ------------------------------------------------------------------ */
static void launch_app(const char *app_id) {
    /* Build luna-send command string */
    static char cmd[512];
    static char arg_payload[256];

    /* payload: {"id":"<app_id>"} */
    int i = 0, j = 0;
    const char *pre  = "{\"id\":\"";
    const char *post = "\"}";
    while (pre[j])  arg_payload[i++] = pre[j++];
    j = 0;
    while (app_id[j] && i < 240) arg_payload[i++] = app_id[j++];
    j = 0;
    while (post[j]) arg_payload[i++] = post[j++];
    arg_payload[i] = '\0';

    log_int("[hook] launching app, keycode triggered launch", 0);
    hook_log(arg_payload);

    /* fork + execve luna-send */
    int pid = raw_fork();
    if (pid == 0) {
        /* child */
        char *argv[] = {
            "/usr/bin/luna-send",
            "-n", "1",
            "luna://com.webos.applicationManager/launch",
            arg_payload,
            (char *)0
        };
        char *envp[] = { (char *)0 };
        raw_execve("/usr/bin/luna-send", argv, envp);
        raw_exit(1); /* execve failed */
    }
    /* parent returns immediately — child runs in background */
}

/* ------------------------------------------------------------------ */
/* Config loader                                                         */
/* ------------------------------------------------------------------ */
static void reload_config(void) {
    long sz = file_size(CONFIG_PATH);
    if (sz < 0 || sz == g_config_size) return;
    g_config_size   = sz;
    g_keybind_count = 0;

    int fd = open(CONFIG_PATH, O_RDONLY);
    if (fd < 0) { hook_log("[hook] cannot open config"); return; }

    char *buf = (char *)sbrk(sz + 1);
    ssize_t got = read(fd, buf, sz);
    close(fd);
    if (got <= 0) return;
    buf[got] = '\0';

    hook_log("[hook] reloading config...");

    const char *p = buf;
    while (*p) {
        while (*p && *p != '"') p++;
        if (!*p) break;
        p++;
        /* skip non-numeric keys (like our "reload" sentinel) */
        if (*p < '0' || *p > '9') {
            while (*p && *p != '"') p++;
            if (*p) p++;
            continue;
        }
        int keycode = parse_int(p);
        while (*p && *p != '"') p++;
        if (*p) p++;

        while (*p && *p != '{' && *p != '}') p++;
        if (*p != '{') break;

        const char *os = p;
        int depth = 0;
        const char *oe = p;
        while (*oe) {
            if (*oe == '{') depth++;
            else if (*oe == '}') { if (--depth == 0) { oe++; break; } }
            oe++;
        }
        int olen = (int)(oe - os);
        char obj[512];
        if (olen >= (int)sizeof(obj)) { p = oe; continue; }
        memcpy(obj, os, olen);
        obj[olen] = '\0';

        char action_str[32] = "";
        find_str(obj, "action", action_str, sizeof(action_str));

        int  action       = ACTION_PASS;
        int  replace_code = 0;
        char app_id[MAX_APP_ID] = "";

        if (action_str[0] == 'd') {
            action = ACTION_DISABLE;
        } else if (action_str[0] == 'r' && action_str[1] == 'e' && action_str[2] == 'p') {
            action = ACTION_REPLACE;
            find_int(obj, "keycode", &replace_code);
        } else if (action_str[0] == 'l') {
            action = ACTION_LAUNCH;
            find_str(obj, "id", app_id, sizeof(app_id));
        }

        if (action != ACTION_PASS && g_keybind_count < MAX_KEYBINDS) {
            g_keybinds[g_keybind_count].keycode      = keycode;
            g_keybinds[g_keybind_count].action       = action;
            g_keybinds[g_keybind_count].replace_code = replace_code;
            memcpy(g_keybinds[g_keybind_count].app_id, app_id, MAX_APP_ID);
            g_keybind_count++;
            log_int("[hook] loaded keycode=", keycode);
        }
        p = oe;
    }
    log_int("[hook] total keybinds=", g_keybind_count);
}

/* ------------------------------------------------------------------ */
/* uinput fd cache                                                       */
/* ------------------------------------------------------------------ */
static int is_uinput_fd(int fd) {
    for (int i = 0; i < g_uinput_fd_count; i++)
        if (g_uinput_fds[i] == fd) return 1;
    char path[40]; int n = 0;
    const char *pre = "/proc/self/fd/";
    while (*pre) path[n++] = *pre++;
    char tmp[12]; int ti = 0, v = fd;
    if (v == 0) tmp[ti++] = '0';
    else while (v > 0) { tmp[ti++] = '0' + v%10; v /= 10; }
    for (int i = ti-1; i >= 0; i--) path[n++] = tmp[i];
    path[n] = '\0';
    char target[64];
    ssize_t len = readlink(path, target, sizeof(target)-1);
    if (len > 0) {
        target[len] = '\0';
        if (strcmp(target, "/dev/uinput") == 0) {
            if (g_uinput_fd_count < MAX_FDS)
                g_uinput_fds[g_uinput_fd_count++] = fd;
            return 1;
        }
    }
    return 0;
}

/* ------------------------------------------------------------------ */
/* Keybind lookup                                                        */
/* ------------------------------------------------------------------ */
static keybind_t *find_keybind(int code) {
    for (int i = 0; i < g_keybind_count; i++)
        if (g_keybinds[i].keycode == code) return &g_keybinds[i];
    return (keybind_t *)0;
}

/* ------------------------------------------------------------------ */
/* write() hook                                                          */
/* ------------------------------------------------------------------ */
ssize_t write(int fd, const void *buf, size_t count) {
    if (!real_write) {
        /* get real write via RTLD_NEXT without dlsym/dlopen */
        real_write = (ssize_t (*)(int, const void *, size_t))raw_write;
    }

    if (count < sizeof(input_event_t) || !is_uinput_fd(fd))
        return raw_write(fd, buf, count);

    reload_config();

    const input_event_t *ev = (const input_event_t *)buf;

#if DISABLE_SCROLL_AND_POINTER
    if (ev->type == EV_REL)
        return (ssize_t)count;
#endif

    if (ev->type == EV_KEY && ev->value == 1) {
        log_int("[hook] KEY code=", (int)ev->code);

        keybind_t *kb = find_keybind((int)ev->code);
        if (kb) {
            if (kb->action == ACTION_DISABLE) {
                log_int("[hook] DISABLED key=", (int)ev->code);
                return (ssize_t)count;
            }
            if (kb->action == ACTION_REPLACE) {
                input_event_t mod = *ev;
                mod.code = (uint16_t)kb->replace_code;
                log_int("[hook] REPLACED key=", (int)ev->code);
                return raw_write(fd, &mod, count);
            }
            if (kb->action == ACTION_LAUNCH) {
                log_int("[hook] LAUNCH for key=", (int)ev->code);
                launch_app(kb->app_id);
                return (ssize_t)count; /* swallow original keypress */
            }
        }
    }

    return raw_write(fd, buf, count);
}

/* ------------------------------------------------------------------ */
/* Constructor                                                           */
/* ------------------------------------------------------------------ */
__attribute__((constructor))
static void hook_init(void) {
    g_log_fd = open(LOG_PATH, O_WRONLY | O_CREAT | O_APPEND, 0644);
    hook_log("[hook] lginput-hook loaded");
    hook_log(DISABLE_SCROLL_AND_POINTER ?
             "[hook] scroll blocking: ON" :
             "[hook] scroll blocking: OFF");
    reload_config();
}
