#  ![icon](/webos-app/icon.png)Mahta

*Wield your remote.*

A webOS app for [lginput-native-hook](lginput-native-hook/README.md) that lets you install the
hook and remap Magic Remote buttons directly on the TV, with the remote.


## Features
For detailed usage instructions, see the [**Using the App**](#using-the-app) section below.

- [**Status & Install**](#status--install) shows whether the hook library, LD_PRELOAD activation,
  boot persistence, and `lginput2` are healthy.
- [**Remote**](#remote) shows an interactive, on-screen representation of a Magic Remote.
- [**Button List**](#button-list) shows every key based on [this list](https://gist.githubusercontent.com/Simon34545/fc5c91e0456789dd7a56a947c1148939/raw/) and my limited testing.
- [**Apps**](#apps) shows all apps installed on the TV.

## Requirements

- LG webOS 9.x TV, webOS 24(tested, working), rooted, with the
  [Homebrew Channel](https://github.com/webosbrew/webos-homebrew-channel)
  installed. The app executes privileged operations through the Homebrew
  Channel's root service (`org.webosbrew.hbchannel.service/exec`), so the
  Homebrew Channel must be present and the TV must be rooted.

## Building the IPK

Requires the webOS CLI tools (`npm install -g @webos-tools/cli`):

Clone the repo, then:
```bash
cd Mahta
ares-package webos-app -o dist
```

This produces `dist/org.kevinlworthington.lginputhook_0.9.0_all.ipk`.

> The hook's `install.sh` / `uninstall.sh` are bundled in `webos-app/assets/`.
> If you rebuild the hook with `build.sh`, copy the regenerated scripts there
> before packaging.

## Installing on the TV

Download the latest version from [Releases](https://github.com/KevinLWorthington/Mahta/releases/latest)
or build with instructions above.

With root SSH access (Homebrew Channel):

```bash
scp dist/org.kevinlworthington.lginputhook_0.9.0_all.ipk root@<TV_IP>:/tmp/
ssh root@<TV_IP> "luna-send -i 'luna://com.webos.appInstallService/dev/install' \
  '{\"id\":\"org.kevinlworthington.lginputhook\",\"ipkUrl\":\"/tmp/org.kevinlworthington.lginputhook_0.9.0_all.ipk\",\"subscribe\":true}'"
```

(Press Ctrl-C once it reports `installed`.)

Or, with WebOS Dev Manager:

- Select "Apps" at the top left, click "Install" at the top right, navigate to and select the .ipk.

The app then appears in the TV's launcher bar as **Mahta**.

## Using the app
### Status & Install
- Install, reinstall, uninstall the hook and restart `lginput2` with one click.
  The install/uninstall scripts for the hook are bundled inside the app.
![Not installed](/screenshots/001.png)
![Installed](/screenshots/002.png)
### Remote
- Navigate to a button. Select it to remap it.
- If a button's default behavior has been changed, it will get a color coded dot.
![Remote hidden buttons](/screenshots/003.png)
- Show the hidden nav/power buttons. You'll be warned if you try to remap one of these buttons.
![Remote unhidden buttons](/screenshots/004.png)
![Remap a button](/screenshots/005.png)
### Button List
- Show the entire list of known buttons. Click "Identify a button..." to check what a button on your remote does.
- Select a button to remap it.
![Button list](/screenshots/006.png)
![ID a button](/screenshots/007.png)
### Apps
- Shows a list of all apps installed on the TV. Select one to launch it.
![App list](/screenshots/008.png)
![Selected app](/screenshots/009.png)



## Additional Notes and Safety Concerns

- As long as you have SSH access to your TV, the app should be safe.
  Still, use the app at your own risk. I've only tested this to work on my TV/remote (OLED65C3, WebOS 24 v9.x, MR23 Magic Remote).
- Remapping OK / arrows / Back / Home can make the TV (and this app) hard or impossible to
  drive with the remote. These buttons are hidden in the app by default and can be shown by selecting the
  "Show navigation and power buttons" checkbox. A warning will appear when attempting to remap
  any of these buttons. If you do lock yourself out, i.e remap the OK/Select button, SSH in and
  edit/delete the keybinds file (/home/root/.config/lginputhook/keybinds.json).
