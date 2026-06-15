| Key Name | Key Code | |
|----------|----------|-|
| KEY_OK | 28 |
| KEY_RED | 398 |
| KEY_GREEN | 399 |
| KEY_YELLOW | 400 |
| KEY_BLUE | 401 |
| KEY_NETFLIX | 1037 |
| KEY_AMAZON | 1038 |
| KEY_DISNEY | 1042 |
| KEY_LGCHANNELS | 1043 |
| KEY_SLINGTV | 1107 |
| KEY_ALEXAVOICE | 1086 |
| KEY_VOLUMEUP | 115 |
| KEY_VOLUMEDOWN | 114 |
| KEY_MUTE | 113 |
| KEY_CHANNELUP | 402 |
| KEY_CHANNELDOWN | 403 |
| KEY_UP | 103 |
| KEY_DOWN | 108 |
| KEY_LEFT | 105 |
| KEY_RIGHT | 106 |
| KEY_BACK | 412 |
| KEY_SETTINGS | 139 | #Gear button |
| KEY_INFO | 358 |
| KEY_CURSOR(Q) | 1198 | #Show Cursor |
| KEY_CURSOR(Q2) | 1199 | #Hide Cursor |
| KEY_1 | 2 |
| KEY_2 | 3 |
| KEY_3 | 4 |
| KEY_4 | 5 |
| KEY_5 | 6 |
| KEY_6 | 7 |
| KEY_7 | 8 |
| KEY_8 | 9 |
| KEY_9 | 10 |
| KEY_0 | 11 |
| KEY_SCREEN_REMOTE | 994 |
| KEY_GUIDE | 362 |
| KEY_INPUT | 241 | #On-screen input selector |
| KEY_HOME | 773 |

> The physical power button's code has not been captured from the log (the TV
> powers off before it can be read), but per
> [LG's own key table](https://gist.github.com/Simon34545/fc5c91e0456789dd7a56a947c1148939)
> it is almost certainly **116** (`POWER` — the standard Linux `KEY_POWER`,
> with no RF variant). That table also confirms 773 = `RF_HOME`,
> 139 = `MENU` (gear), 241 = `TV_VIDEO` (input selector), and
> 994 = `RF_SCREEN_REMOTE`.
