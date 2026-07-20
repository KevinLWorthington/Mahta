#include <errno.h>
#include <fcntl.h>
#include <limits.h>
#include <stdarg.h>
#include <stddef.h>
#include <stdio.h>
#include <string.h>
#include <sys/stat.h>
#include <sys/syscall.h>
#include <sys/types.h>
#include <sys/wait.h>
#include <time.h>
#include <unistd.h>

#define CONFIG_PATH "/home/root/.config/lginputhook/keybinds.json"
#define CAPTURE_PATH "/home/root/.config/lginputhook/capture-request"
#define LOG_PATH "/tmp/lginput-hook-native.log"

#define EV_SYN 0
#define EV_KEY 1
#define EV_REL 2

#define ACTION_NONE 0
#define ACTION_DISABLE 1
#define ACTION_REPLACE 2
#define ACTION_LAUNCH 3

#define MAX_CONFIG_BYTES 24576
#define MAX_BINDINGS 160
#define MAX_APP_ID 160
#define MAX_EVENTS 128

struct input_event_compat {
    long tv_sec;
    long tv_usec;
    unsigned short type;
    unsigned short code;
    int value;
};

struct binding {
    int code;
    int action;
    int keycode;
    char app_id[MAX_APP_ID];
};

struct config_cache {
    time_t mtime;
    off_t size;
    int count;
    struct binding bindings[MAX_BINDINGS];
};

static struct config_cache config = { 0, 0, 0, {{0}} };
static int cached_fd = -1;
static int cached_fd_is_uinput = 0;
static int captured_key_code = -1;

static ssize_t real_write_fd(int fd, const void *buf, size_t count)
{
    return (ssize_t)syscall(SYS_write, fd, buf, count);
}

static int is_digit(char c)
{
    return c >= '0' && c <= '9';
}

static int is_space(char c)
{
    return c == ' ' || c == '\t' || c == '\r' || c == '\n';
}

static void append_log(const char *fmt, ...)
{
    char line[256];
    va_list args;
    int len;
    int fd;

    va_start(args, fmt);
    len = vsnprintf(line, sizeof(line), fmt, args);
    va_end(args);
    if (len <= 0) return;
    if (len > (int)sizeof(line)) len = (int)sizeof(line);

    fd = open(LOG_PATH, O_WRONLY | O_CREAT | O_APPEND | O_NONBLOCK | O_NOFOLLOW, 0644);
    if (fd < 0) {
        if (errno != ENOENT) unlink(LOG_PATH);
        return;
    }
    {
        struct stat st;
        if (fstat(fd, &st) != 0 || !S_ISREG(st.st_mode) || st.st_uid != 0 ||
            st.st_nlink != 1 || (st.st_mode & (S_IWGRP | S_IWOTH)) != 0) {
            close(fd);
            unlink(LOG_PATH);
            return;
        }
    }
    real_write_fd(fd, line, (size_t)len);
    close(fd);
}

static const char *bounded_find(const char *start, const char *end, const char *needle)
{
    size_t len = strlen(needle);
    const char *p;

    if (len == 0 || start >= end) return NULL;
    for (p = start; p + len <= end; p++) {
        if (memcmp(p, needle, len) == 0) return p;
    }
    return NULL;
}

static const char *find_colon(const char *start, const char *end)
{
    const char *p;

    for (p = start; p < end; p++) {
        if (*p == ':') return p;
    }
    return NULL;
}

static int read_quoted_string(const char *start, const char *end, char *out, int out_cap)
{
    const char *p;
    int n = 0;

    for (p = start; p < end && *p != '"'; p++) {
        if (*p == '\\' && p + 1 < end) p++;
        if (n + 1 < out_cap) out[n++] = *p;
    }
    if (p >= end || *p != '"') return 0;
    out[n] = '\0';
    return 1;
}

static int find_string_field(const char *start, const char *end, const char *field, char *out, int out_cap)
{
    char needle[48];
    const char *p;
    const char *colon;

    snprintf(needle, sizeof(needle), "\"%s\"", field);
    p = bounded_find(start, end, needle);
    if (!p) return 0;
    colon = find_colon(p, end);
    if (!colon) return 0;
    for (p = colon + 1; p < end && *p != '"'; p++) {}
    if (p >= end) return 0;
    return read_quoted_string(p + 1, end, out, out_cap);
}

static int find_int_field(const char *start, const char *end, const char *field, int *out)
{
    char needle[48];
    const char *p;
    const char *colon;
    int value = 0;
    int found = 0;

    snprintf(needle, sizeof(needle), "\"%s\"", field);
    p = bounded_find(start, end, needle);
    if (!p) return 0;
    colon = find_colon(p, end);
    if (!colon) return 0;
    for (p = colon + 1; p < end && !is_digit(*p); p++) {}
    while (p < end && is_digit(*p)) {
        value = value * 10 + (*p - '0');
        found = 1;
        p++;
    }
    if (!found) return 0;
    *out = value;
    return 1;
}

static void add_binding(int code, int action, int keycode, const char *app_id)
{
    struct binding *b;

    if (config.count >= MAX_BINDINGS) return;
    b = &config.bindings[config.count++];
    b->code = code;
    b->action = action;
    b->keycode = keycode;
    b->app_id[0] = '\0';
    if (app_id) {
        strncpy(b->app_id, app_id, sizeof(b->app_id) - 1);
        b->app_id[sizeof(b->app_id) - 1] = '\0';
    }
}

static void parse_config(char *buf, ssize_t len)
{
    const char *end = buf + len;
    const char *p = buf;

    config.count = 0;
    while (p < end && config.count < MAX_BINDINGS) {
        const char *quote;
        const char *code_start;
        const char *block_start;
        const char *block_end;
        int code = 0;
        char action[24];

        quote = bounded_find(p, end, "\"");
        if (!quote) break;
        code_start = quote + 1;
        if (!is_digit(*code_start)) {
            p = code_start;
            continue;
        }
        while (code_start < end && is_digit(*code_start)) {
            code = code * 10 + (*code_start - '0');
            code_start++;
        }
        if (code_start >= end || *code_start != '"') {
            p = code_start;
            continue;
        }

        block_start = bounded_find(code_start, end, "{");
        block_end = block_start ? bounded_find(block_start, end, "}") : NULL;
        if (!block_start || !block_end) break;

        if (find_string_field(block_start, block_end, "action", action, sizeof(action))) {
            if (strcmp(action, "disable") == 0) {
                add_binding(code, ACTION_DISABLE, 0, NULL);
            } else if (strcmp(action, "replace") == 0) {
                int keycode = 0;
                if (find_int_field(block_start, block_end, "keycode", &keycode)) {
                    add_binding(code, ACTION_REPLACE, keycode, NULL);
                }
            } else if (strcmp(action, "launch") == 0) {
                char app_id[MAX_APP_ID];
                if (find_string_field(block_start, block_end, "id", app_id, sizeof(app_id))) {
                    add_binding(code, ACTION_LAUNCH, 0, app_id);
                }
            }
        }

        p = block_end + 1;
    }
}

static void load_config_if_needed(void)
{
    struct stat st;
    char buf[MAX_CONFIG_BYTES + 1];
    ssize_t len;
    int fd;

    if (stat(CONFIG_PATH, &st) != 0) {
        config.mtime = 0;
        config.size = 0;
        config.count = 0;
        return;
    }
    if (config.mtime == st.st_mtime && config.size == st.st_size) return;

    fd = open(CONFIG_PATH, O_RDONLY);
    if (fd < 0) {
        config.count = 0;
        return;
    }
    len = read(fd, buf, MAX_CONFIG_BYTES);
    close(fd);
    if (len <= 0) {
        config.count = 0;
        return;
    }
    buf[len] = '\0';
    config.mtime = st.st_mtime;
    config.size = st.st_size;
    parse_config(buf, len);
}

static struct binding *find_binding(int code)
{
    int i;

    load_config_if_needed();
    for (i = 0; i < config.count; i++) {
        if (config.bindings[i].code == code) return &config.bindings[i];
    }
    return NULL;
}

static int is_uinput_fd(int fd)
{
    char path[64];
    char target[160];
    ssize_t len;

    if (fd == cached_fd) return cached_fd_is_uinput;
    cached_fd = fd;
    cached_fd_is_uinput = 0;

    snprintf(path, sizeof(path), "/proc/self/fd/%d", fd);
    len = readlink(path, target, sizeof(target) - 1);
    if (len <= 0) return 0;
    target[len] = '\0';
    cached_fd_is_uinput = strstr(target, "/dev/uinput") != NULL;
    return cached_fd_is_uinput;
}

static int read_capture_request_file(const char *path, uid_t required_owner,
                                     char *token, int token_cap, long *expiry)
{
    char buf[160];
    ssize_t len;
    int fd;
    int i = 0;
    int p = 0;
    long parsed_expiry = 0;
    struct stat st;
    time_t now;

    fd = open(path, O_RDONLY | O_NONBLOCK | O_NOFOLLOW);
    if (fd < 0) {
        if (errno != ENOENT) unlink(path);
        return 0;
    }
    if (fstat(fd, &st) != 0 || !S_ISREG(st.st_mode) || st.st_uid != required_owner ||
        st.st_nlink != 1 || st.st_size <= 0 || st.st_size >= (off_t)sizeof(buf) ||
        (st.st_mode & (S_IWGRP | S_IWOTH)) != 0) {
        close(fd);
        unlink(path);
        return 0;
    }
    len = read(fd, buf, sizeof(buf) - 1);
    close(fd);
    if (len <= 0 || (off_t)len != st.st_size) {
        unlink(path);
        return 0;
    }
    buf[len] = '\0';

    while (p < len && !is_space(buf[p])) {
        char c = buf[p++];
        if (!((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || is_digit(c) || c == '_' || c == '-')) {
            unlink(path);
            return 0;
        }
        if (i + 1 >= token_cap) {
            unlink(path);
            return 0;
        }
        token[i++] = c;
    }
    token[i] = '\0';
    while (p < len && is_space(buf[p])) p++;
    if (i == 0 || p >= len || !is_digit(buf[p])) {
        unlink(path);
        return 0;
    }
    while (p < len && is_digit(buf[p])) {
        int digit = buf[p] - '0';
        if (parsed_expiry > (LONG_MAX - digit) / 10) {
            unlink(path);
            return 0;
        }
        parsed_expiry = parsed_expiry * 10 + digit;
        p++;
    }
    while (p < len && is_space(buf[p])) p++;
    if (p != len) {
        unlink(path);
        return 0;
    }

    now = time(NULL);
    if (parsed_expiry <= (long)now) {
        unlink(path);
        return 0;
    }
    *expiry = parsed_expiry;
    return 1;
}

static int read_capture_request(char *token, int token_cap, long *expiry)
{
    return read_capture_request_file(CAPTURE_PATH, 0, token, token_cap, expiry);
}

static int consume_capture_if_active(int code)
{
    char token[80];
    long expiry;

    if (!read_capture_request(token, sizeof(token), &expiry)) return 0;
    unlink(CAPTURE_PATH);
    captured_key_code = code;
    append_log("CAPTURE token=%s code=%d\n", token, code);
    return 1;
}

static void json_escape(char *out, int out_cap, const char *in)
{
    int n = 0;

    while (*in && n + 1 < out_cap) {
        if ((*in == '"' || *in == '\\') && n + 2 < out_cap) out[n++] = '\\';
        out[n++] = *in++;
    }
    out[n] = '\0';
}

static void launch_app(const char *app_id)
{
    pid_t pid;

    pid = fork();
    if (pid == 0) {
        pid_t child = fork();
        if (child == 0) {
            char escaped[MAX_APP_ID * 2];
            char payload[MAX_APP_ID * 2 + 16];
            char *argv[6];
            char *envp[2];

            json_escape(escaped, sizeof(escaped), app_id);
            snprintf(payload, sizeof(payload), "{\"id\":\"%s\"}", escaped);
            argv[0] = "/usr/bin/luna-send";
            argv[1] = "-n";
            argv[2] = "1";
            argv[3] = "luna://com.webos.applicationManager/launch";
            argv[4] = payload;
            argv[5] = NULL;
            envp[0] = "PATH=/usr/bin:/bin:/usr/sbin:/sbin";
            envp[1] = NULL;
            execve(argv[0], argv, envp);
            _exit(127);
        }
        _exit(0);
    }
    if (pid > 0) waitpid(pid, NULL, 0);
}

static int process_event(struct input_event_compat *ev)
{
    struct binding *binding;

    if (ev->type == EV_REL) return 0;
    if (ev->type != EV_KEY) return 1;

    append_log("KEY code=%u value=%d\n", ev->code, ev->value);

    if (captured_key_code == ev->code) {
        if (ev->value == 0) captured_key_code = -1;
        return 0;
    }

    if (ev->value == 1 && consume_capture_if_active(ev->code)) {
        return 0;
    }

    binding = find_binding(ev->code);
    if (!binding) return 1;

    if (binding->action == ACTION_DISABLE) return 0;
    if (binding->action == ACTION_REPLACE) {
        ev->code = (unsigned short)binding->keycode;
        return 1;
    }
    if (binding->action == ACTION_LAUNCH) {
        if (ev->value == 0) launch_app(binding->app_id);
        return 0;
    }
    return 1;
}

ssize_t write(int fd, const void *buf, size_t count)
{
    const struct input_event_compat *events;
    struct input_event_compat out[MAX_EVENTS];
    size_t event_size = sizeof(struct input_event_compat);
    size_t event_count;
    size_t out_count = 0;
    size_t i;
    ssize_t written;

    if (count < event_size || count % event_size != 0 || !is_uinput_fd(fd)) {
        return real_write_fd(fd, buf, count);
    }

    event_count = count / event_size;
    if (event_count > MAX_EVENTS) return real_write_fd(fd, buf, count);

    events = (const struct input_event_compat *)buf;
    for (i = 0; i < event_count; i++) {
        out[out_count] = events[i];
        if (process_event(&out[out_count])) out_count++;
    }

    if (out_count == 0) return (ssize_t)count;
    written = real_write_fd(fd, out, out_count * event_size);
    if (written < 0) return written;
    return (ssize_t)count;
}
