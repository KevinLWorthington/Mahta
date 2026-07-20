#include <stdlib.h>

#include "../lginput-native-hook/lginput-hook.c"

static int write_request(const char *path, mode_t mode, const char *contents)
{
    int fd = open(path, O_WRONLY | O_CREAT | O_TRUNC, mode);
    size_t len = strlen(contents);

    if (fd < 0) return 0;
    if (real_write_fd(fd, contents, len) != (ssize_t)len) {
        close(fd);
        return 0;
    }
    close(fd);
    return chmod(path, mode) == 0;
}

static int test_capture_file_validation(void)
{
    char dir[] = "/tmp/mahta-capture-test-XXXXXX";
    char request_path[160];
    char target_path[160];
    char fifo_path[160];
    char contents[120];
    char token[80];
    long expiry = 0;

    if (!mkdtemp(dir)) return 10;
    snprintf(request_path, sizeof(request_path), "%s/request", dir);
    snprintf(target_path, sizeof(target_path), "%s/target", dir);
    snprintf(fifo_path, sizeof(fifo_path), "%s/fifo", dir);
    snprintf(contents, sizeof(contents), "mahta-test %ld\n", (long)time(NULL) + 60);

    if (!write_request(request_path, 0600, contents)) return 11;
    if (!read_capture_request_file(request_path, getuid(), token, sizeof(token), &expiry)) return 12;
    if (strcmp(token, "mahta-test") != 0) return 13;
    unlink(request_path);

    if (!write_request(request_path, 0600, contents)) return 14;
    if (read_capture_request_file(request_path, getuid() + 1, token, sizeof(token), &expiry)) return 15;
    if (access(request_path, F_OK) == 0) return 16;

    if (!write_request(request_path, 0666, contents)) return 17;
    if (read_capture_request_file(request_path, getuid(), token, sizeof(token), &expiry)) return 18;
    if (access(request_path, F_OK) == 0) return 19;

    if (!write_request(target_path, 0600, contents)) return 20;
    if (symlink(target_path, request_path) != 0) return 21;
    if (read_capture_request_file(request_path, getuid(), token, sizeof(token), &expiry)) return 22;
    if (access(request_path, F_OK) == 0 || access(target_path, F_OK) != 0) return 23;

    if (mkfifo(fifo_path, 0600) != 0) return 24;
    if (read_capture_request_file(fifo_path, getuid(), token, sizeof(token), &expiry)) return 25;
    if (access(fifo_path, F_OK) == 0) return 26;

    unlink(target_path);
    if (rmdir(dir) != 0) return 27;
    return 0;
}

int main(void)
{
    struct input_event_compat event = { 0, 0, EV_KEY, 773, 2 };
    int validation_result = test_capture_file_validation();

    if (validation_result != 0) return validation_result;

    captured_key_code = 773;
    if (process_event(&event) != 0) return 1;
    if (captured_key_code != 773) return 2;

    event.value = 0;
    if (process_event(&event) != 0) return 3;
    if (captured_key_code != -1) return 4;

    return 0;
}
