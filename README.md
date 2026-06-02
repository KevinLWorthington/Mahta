# lginput-native-hook

A native LD_PRELOAD hook for `lginput2` on **webOS 24+ (9.x)** TVs.

Remaps or disables Magic Remote buttons, including app shortcut keys, scroll
wheel, and pointer cursor. Compatible with webOS 9.x where lginputhook fails.

Installed and configured using CLI.

## Requirements

- LG webOS TV running webOS 9.x (2024 models)
- [Homebrew Channel](https://github.com/webosbrew/webos-homebrew-channel) installed
- Root access enabled in Homebrew Channel settings

## Installation

**Step 1** — Copy the scripts to your TV:
```bash
scp install.sh uninstall.sh root@<TV_IP>:/tmp/
```

**Step 2** — Install:
```bash
ssh root@<TV_IP> 'sh /tmp/install.sh'
```

That's it. The hook activates immediately.

## Uninstall

```bash
ssh root@<TV_IP> 'sh /tmp/uninstall.sh'
```

The uninstall script removes all files and restores the remote to normal.
It will ask whether to keep or remove your keybinds config.

## Configuration

Use `vi /home/root/.config/lginputhook/keybinds.json` via SSH on the TV to edit the config.

### Basic Vi syntax:

Pressing `ESC` enters command mode.

`i` allows editing text

While in command mode:

`:w` saves changes.

`:q` Exits

`:!q` Exits wihout saving.


Changes are picked up automatically.

> **NOTE:** While not strictly required, changing the `"reload"` number when saving the file changes the file size and ensures an automatic config reload.

Example keybinds.json:

```json
{
    "1037": {"action": "launch", "id": "youtube.leanback.v4"},
    "1038": {"action": "launch", "id": "io.strem.tv"},
    "1042": {"action": "replace", "keycode": 1038},
    "1198": {"action": "disable"}, #Cursor show ID
    "1199": {"action": "disable"}, #Cursor hide ID
    "reload": "2"
}
```

### Actions

| Action | Description | Extra field |
|--------|-------------|-------------|
| `disable` | Swallows the button press; does nothing | — |
| `replace` | Sends a different key code instead | `"keycode": <id>` |
| `launch` | Opens a webOS app | `"id": "<app_id>"` |

### Finding button codes

Press buttons and watch the log:
```bash
tail -f /tmp/lginput-hook-native.log
```

### Finding app IDs
```bash
luna-send -n 1 'luna://com.webos.applicationManager/listApps' '{}' | grep -o '"id":"[^"]*"\|"title":"[^"]*"' | paste - -
```

### Example codes (MR23 Magic Remote, 2023)

| Button | Code |
|--------|------|
| Netflix | 1037 |
| Prime Video | 1038 |
| Disney+ | 1042 |
| LG Channels | 1043 |
| Alexa | 1086 |
| Sling | 1107 |
| Show pointer | 1198 |
| Hide pointer | 1199 |

The full keymap for my TV/remote combo can be found [here](https://github.com/KevinLWorthington/lg-native-hook/blob/main/Key%20Maps/Key_Map_MR23.md).

## Logs

```bash
tail -f /tmp/lginput-hook-native.log
```

## Building from source

Requires WSL or Linux with `arm-linux-gnueabi-gcc`:
```bash
sudo apt install gcc-arm-linux-gnueabi binutils
./build.sh
```

This produces `install.sh` and `uninstall.sh`.

## How it works

`lginput2` is LG's input daemon — it processes all remote control events and
writes them to `/dev/uinput`. This hook intercepts those `write()` calls via
`LD_PRELOAD`, inspecting each input event before it reaches the kernel.

- `EV_REL` events (pointer movement) are dropped to suppress cursor movement
- `EV_KEY` events are matched against the keybinds config for disable/replace/launch
- App launches use `fork()` + `execve()` to call `luna-send` directly
- Uses only raw ARM syscalls
- Activated via `LD_PRELOAD` in `/var/systemd/system/env/lginput2.env`
- Persists across reboots via `/var/lib/webosbrew/init.d/` startup hook

## Compatibility

| webOS version | Year | Status |
|---------------|------|--------|
| 9.x | 2024 | ✅ Tested on OLED65C3PUA |
| 8.x | 2023 | ⚠️ Untested; may work |
| 7.x and older | 2022- | ❌ Use [lginputhook](https://github.com/Simon34545/lginputhook) instead |

## Disclaimer

I make no guarantees of functionality, compatibility or that you won't damage something by using these scripts.

This project was intended for my personal use and has only been tested on a single TV (OLED65C3PUA).
My main goal was simply to disable the annoying cursor and dedicated app buttons on my remote. The other implementations available for remote remapping wouldn't work on my TV.

Claude AI was heavily used in developing these scripts. While I understand the disdain for AI, it allowed me to get a project going in a matter of hours that would have likely taken me days or weeks, if I would have been able to keep up with it at all.

I'm sharing the project for anyone interested in trying it or for those smarter than me to run with it and make something better.

I would like to create an app that can be installed via HomeBrew that would allow customisation directly on the TV, but I do not know if I will get to it or not.

If you test this on your TV/remote, [let me know](https://github.com/KevinLWorthington/lg-native-hook/discussions/1).
