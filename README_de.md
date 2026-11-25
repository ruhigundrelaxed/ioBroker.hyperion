![Logo](admin/hyperion.png)

# ioBroker.hyperion

[![NPM version](https://img.shields.io/npm/v/iobroker.hyperion.svg)](https://www.npmjs.com/package/iobroker.hyperion)
[![Downloads](https://img.shields.io/npm/dm/iobroker.hyperion.svg)](https://www.npmjs.com/package/iobroker.hyperion)
[![Test and Release](https://github.com/ruhigundrelaxed/ioBroker.hyperion/actions/workflows/test-and-release.yml/badge.svg)](https://github.com/ruhigundrelaxed/ioBroker.hyperion/actions/workflows/test-and-release.yml)

[🇬🇧 English](README.md) · 🇩🇪 Deutsch

Steuert [Hyperion](https://hyperion-project.org/)-Ambient-Lighting aus ioBroker — sowohl **Hyperion.ng** als auch das ursprüngliche **Hyperion Classic**.
Der Adapter erkennt den Servertyp automatisch und spricht dessen JSON-API über TCP an.

Seit 1.0 ist der Adapter eine komplette Neuentwicklung in TypeScript. **Update von 0.0.x? Bitte zuerst [Inkompatible Änderungen](#inkompatible-änderungen-gegenüber-00x) lesen.**

## Funktionen

- Automatische Erkennung von Hyperion.ng und Hyperion Classic
- Farbe per HEX, RGB oder HSV, Helligkeit, An/Aus
- Effekte: Liste, Start per Name oder mit eigenen Parametern
- Eine oder alle Prioritäten löschen, einstellbare Standard-Priorität
- Hyperion.ng: Komponenten (z. B. LED-Gerät, Grabber) an/aus, Adjustments, Prioritäten, Instanzauswahl, Token-Authentifizierung
- Push-Updates von Hyperion.ng (Subscriptions); Polling bei Classic
- Automatischer Reconnect mit Backoff
- Mehrere Adapter-Instanzen können mehrere Hyperion-Server oder Hyperion.ng-Instanzen steuern

## Voraussetzungen

- js-controller ≥ 5, Node.js ≥ 20
- Hyperion mit aktivierter JSON-API (Standard-Port 19444)

## Konfiguration

| Einstellung | Standard | Beschreibung |
|---|---|---|
| Hyperion Host | `127.0.0.1` | IP-Adresse oder Hostname des Hyperion-Servers |
| JSON Port | `19444` | TCP-Port der JSON-API |
| Standard-Priorität | `50` | Priorität für Farb- und Effektbefehle (1–999; niedriger gewinnt) |
| Origin | `ioBroker` | Herkunft, die Hyperion.ng für Befehle dieses Adapters anzeigt |
| Reconnect-Intervall (s) | `5` | Grundabstand zwischen Verbindungsversuchen |
| Auth-Token | leer | Hyperion.ng-Token, nur nötig bei aktivierter API-Authentifizierung |
| Hyperion.ng-Instanz | `0` | Instanz, die dieser Adapter steuert; wird nach jedem Reconnect erneut gewählt |
| Poll-Intervall Classic (s) | `30` | Wie oft der Zustand von Hyperion Classic abgefragt wird |

Für mehrere Hyperion.ng-Instanzen (z. B. mehrere LED-Streifen an einem Server) je Hyperion.ng-Instanz eine Adapter-Instanz anlegen.

## Datenpunkte

| Datenpunkt | Typ | Beschreibung |
|---|---|---|
| `info.connection` | boolean | Verbunden mit Hyperion |
| `info.serverType` | string | `ng` oder `classic` |
| `info.serverVersion` | string | Hyperion-Version |
| `videomode` | string | Aktueller Videomodus (z. B. `2D`) |
| `control.on` | boolean | An/Aus |
| `control.color` | string | Farbe als HEX (`#rrggbb`) |
| `control.red` / `.green` / `.blue` | number | Farbkanäle 0–255 |
| `control.hue` / `.saturation` / `.brightness` | number | Farbe als HSV |
| `control.activeEffect` | string | Aktuell laufender Effekt |
| `control.selectEffect` | string | Effektnamen schreiben, um ihn zu starten |
| `control.priority` | number | Priorität für Befehle (Standard: konfigurierter Wert) |
| `control.clear` / `control.clearall` | button | Priorität des Adapters / alle Prioritäten löschen |
| `effects.list` | json | Namen aller verfügbaren Effekte |
| `effects.<name>.activate` | button | Diesen Effekt starten (mit den Parametern darunter) |
| `effects.<name>.<arg>` | gemischt | Effektparameter, vor dem Start änderbar |
| `adjustment.*` | number | Helligkeit und weitere Adjustments |
| `priorities.list` | json | Aktive Prioritäten |
| `components.<name>` | boolean | Nur Hyperion.ng: Komponente an/aus |
| `instances.active` / `instances.list` | number / json | Nur Hyperion.ng: gesteuerte Instanz / alle Instanzen |

## Inkompatible Änderungen gegenüber 0.0.x

Version 1.0 ist nicht kompatibel mit Skripten, Blockly oder VIS-Ansichten für 0.0.x. Die Einstellungen werden automatisch übernommen, die Datenpunkte nicht.

**Einstellungen** — werden beim ersten Start nach dem Update automatisch übernommen:

| 0.0.x | 1.0 |
|---|---|
| `json_port` | `port` |
| `prio` | `priority` |

**Datenpunkte** — bitte Skripte und Ansichten anpassen:

| 0.0.x | 1.0 |
|---|---|
| `control.LightSwitch` | `control.on` |
| `control.activeColorRGB` | `control.color` (HEX) oder `control.red` / `.green` / `.blue` |
| `control.activeColorHue` | `control.hue` |
| `control.activeColorSat` | `control.saturation` |
| `control.activeColorLum` | `control.brightness` |
| `contorl.activeEffects` (sic) | `control.activeEffect` (lesen) / `control.selectEffect` (schreiben) |
| `effects.<name>.activator` | `effects.<name>.activate` — der `<name>`-Teil kann leicht abweichen |
| `effects.<name>.effects_effect_name` | entfällt; stattdessen `effects.list` |
| `control.clear`, `control.clearall` | unverändert |

Die alten Datenpunkte werden nicht automatisch entfernt. Sobald die Skripte angepasst sind, können sie im Objekte-Tab gelöscht werden.

## Changelog

### 1.0.3 (2026-11-25)
- Einstellungen aus 0.0.x (`json_port`, `prio`) werden automatisch übernommen
- Build: `rimraf` als Dev-Abhängigkeit ergänzt, damit `npm run build` auf einem frischen Checkout funktioniert
- Kurze Farbwerte wie `#fff` werden akzeptiert; ungültige Farben werden nicht mehr zu Schwarz
- Benötigt Node.js ≥ 20
- Unit- und Integrationstests, CI mit GitHub Actions

### 1.0.2 (2026-10-11)
- Neue Einstellung „Hyperion.ng-Instanz“: Der Adapter wählt diese Instanz nach jedem (Re-)Connect
- `instances.active` zeigt die tatsächlich gesteuerte Instanz
- `origin` wird nur noch bei Farb-/Effektbefehlen gesendet (Hyperion.ng lehnt es bei anderen Befehlen ab)

### 1.0.0 (2026-02-11)
- Komplette Neuentwicklung in TypeScript
- Unterstützung für Hyperion.ng (JSON-API, Subscriptions, Komponenten, Instanzen, Token-Authentifizierung)
- Admin-Oberfläche auf Basis von jsonConfig
- Neue Datenpunktstruktur (siehe [Inkompatible Änderungen](#inkompatible-änderungen-gegenüber-00x))

### 0.0.16 (2020-12-01)
- Einige falsche common-Typen korrigiert

Ältere Versionen: siehe [Git-Historie](https://github.com/ruhigundrelaxed/ioBroker.hyperion/commits/master).

## Lizenz

MIT-Lizenz — siehe [LICENSE](LICENSE).

Copyright (c) 2017-2026 ruhigundrelaxed

---

*Version 1.0 wurde mit KI-Unterstützung entwickelt.*
