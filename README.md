![Logo](admin/hyperion.png)

# ioBroker.hyperion

[![NPM version](https://img.shields.io/npm/v/iobroker.hyperion.svg)](https://www.npmjs.com/package/iobroker.hyperion)
[![Downloads](https://img.shields.io/npm/dm/iobroker.hyperion.svg)](https://www.npmjs.com/package/iobroker.hyperion)
[![Test and Release](https://github.com/ruhigundrelaxed/ioBroker.hyperion/actions/workflows/test-and-release.yml/badge.svg)](https://github.com/ruhigundrelaxed/ioBroker.hyperion/actions/workflows/test-and-release.yml)

🇬🇧 English · [🇩🇪 Deutsch](README_de.md)

Control [Hyperion](https://hyperion-project.org/) ambient lighting from ioBroker — both **Hyperion.ng** and the original **Hyperion Classic**.
The adapter detects the server type automatically and talks to its JSON API over TCP.

Since 1.0 the adapter is a complete rewrite in TypeScript. **Upgrading from 0.0.x? Read [Breaking changes](#breaking-changes-from-00x) first.**

## Features

- Automatic detection of Hyperion.ng and Hyperion Classic
- Color by HEX, RGB or HSV, brightness, on/off
- Effects: list, start by name, or start with custom arguments
- Clear one priority or all priorities, configurable default priority
- Hyperion.ng: components (e.g. LED device, grabber) on/off, adjustments, priorities, instance selection, token authentication
- Push updates from Hyperion.ng (subscriptions); polling for Classic
- Automatic reconnect with backoff
- Multiple adapter instances can control multiple Hyperion servers or Hyperion.ng instances

## Requirements

- js-controller ≥ 5, Node.js ≥ 20
- Hyperion with the JSON API enabled (default port 19444)

## Configuration

| Setting | Default | Description |
|---|---|---|
| Hyperion Host | `127.0.0.1` | IP address or hostname of the Hyperion server |
| JSON Port | `19444` | TCP port of the JSON API |
| Default Priority | `50` | Priority for color and effect commands (1–999; lower wins) |
| Origin | `ioBroker` | Origin shown in Hyperion.ng for commands from this adapter |
| Reconnect Interval (s) | `5` | Base delay between reconnection attempts |
| Auth Token | empty | Hyperion.ng token, only needed if API authentication is enabled |
| Hyperion.ng instance | `0` | Instance this adapter controls; selected again after every reconnect |
| Poll Interval Classic (s) | `30` | How often Hyperion Classic is polled for its state |

To control several Hyperion.ng instances (e.g. several LED strips on one server), create one adapter instance per Hyperion.ng instance.

## States

| State | Type | Description |
|---|---|---|
| `info.connection` | boolean | Connected to Hyperion |
| `info.serverType` | string | `ng` or `classic` |
| `info.serverVersion` | string | Hyperion version |
| `videomode` | string | Current video mode (e.g. `2D`) |
| `control.on` | boolean | On/off |
| `control.color` | string | Color as HEX (`#rrggbb`) |
| `control.red` / `.green` / `.blue` | number | Color channels 0–255 |
| `control.hue` / `.saturation` / `.brightness` | number | Color as HSV |
| `control.activeEffect` | string | Currently running effect |
| `control.selectEffect` | string | Write an effect name to start it |
| `control.priority` | number | Priority used for commands (defaults to the configured value) |
| `control.clear` / `control.clearall` | button | Clear the adapter's priority / all priorities |
| `effects.list` | json | Names of all available effects |
| `effects.<name>.activate` | button | Start this effect (with the arguments below) |
| `effects.<name>.<arg>` | mixed | Effect arguments, editable before activating |
| `adjustment.*` | number | Brightness and other adjustments |
| `priorities.list` | json | Active priorities |
| `components.<name>` | boolean | Hyperion.ng only: enable/disable a component |
| `instances.active` / `instances.list` | number / json | Hyperion.ng only: controlled instance / all instances |

## Breaking changes from 0.0.x

Version 1.0 is not compatible with scripts, Blockly or VIS views built for 0.0.x. The settings are migrated automatically; the states are not.

**Settings** — migrated automatically on the first start after the upgrade:

| 0.0.x | 1.0 |
|---|---|
| `json_port` | `port` |
| `prio` | `priority` |

**States** — please update your scripts and views:

| 0.0.x | 1.0 |
|---|---|
| `control.LightSwitch` | `control.on` |
| `control.activeColorRGB` | `control.color` (HEX) or `control.red` / `.green` / `.blue` |
| `control.activeColorHue` | `control.hue` |
| `control.activeColorSat` | `control.saturation` |
| `control.activeColorLum` | `control.brightness` |
| `contorl.activeEffects` (sic) | `control.activeEffect` (read) / `control.selectEffect` (write) |
| `effects.<name>.activator` | `effects.<name>.activate` — the `<name>` part may differ slightly |
| `effects.<name>.effects_effect_name` | removed; use `effects.list` |
| `control.clear`, `control.clearall` | unchanged |

The old states are not removed automatically. Once your scripts are updated, you can delete them in the Objects tab.

## Changelog

### 1.0.3 (2026-11-25)
- Settings from 0.0.x (`json_port`, `prio`) are migrated automatically
- Build: `rimraf` added as dev dependency, so `npm run build` works on a fresh checkout
- Requires Node.js ≥ 20
- Unit and integration tests, CI with GitHub Actions

### 1.0.2 (2026-10-11)
- New setting "Hyperion.ng instance": the adapter selects this instance after every (re)connect
- `instances.active` reports the instance actually controlled
- `origin` is only sent with color/effect commands (Hyperion.ng rejects it on other commands)

### 1.0.0 (2026-02-11)
- Complete rewrite in TypeScript
- Hyperion.ng support (JSON API, subscriptions, components, instances, token authentication)
- Admin UI based on jsonConfig
- New state structure (see [Breaking changes](#breaking-changes-from-00x))

### 0.0.16 (2020-12-01)
- Fixed some wrong common type assignments

Older versions: see the [git history](https://github.com/ruhigundrelaxed/ioBroker.hyperion/commits/master).

## License

MIT License — see [LICENSE](LICENSE).

Copyright (c) 2017-2026 ruhigundrelaxed

---

*Version 1.0 was developed with AI assistance.*
