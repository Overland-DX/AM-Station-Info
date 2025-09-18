# AM-Station-Info Plugin for FM-DX-Webserver

## About

**AM-Station-Info** is a plugin for the [FM-DX-Webserver](https://github.com/NoobishSVK/fm-dx-webserver) that enhances your AM band exploration by providing detailed information for AM radio stations. It replaces the standard station ID panel with a comprehensive overview of the tuned station.

The plugin utilizes a local database, ensuring that station information is always available without relying on an internet connection. It comes pre-loaded with the AOKI database, a well-regarded resource for broadcast information.

The current bundled database is version **A25 (merged June and September 2025 editions)** from AOKI.
<br>

---

<img width="826" height="397" alt="image" src="https://github.com/user-attachments/assets/4a67cc8d-45a6-434c-8862-b4afdf990962" />

<br><br>

## Features

This plugin displays the following information for AM stations:

*   **Station Name:** The name of the broadcasting station.
*   **Location:** The city and country [ROU] of the transmitter.
*   **Distance:** The distance from your radio server to the transmitter site (in kilometers).
*   **Language:** The language of the broadcast.
*   **Broadcast Time:** The scheduled transmission times in UTC.
*   **Transmitter Power:** The output power of the transmitter (in kW).
*   **Country Code:** The official country code for the transmitter's location.

### Custom Database Support

Users have the flexibility to create and use their own custom databases. A simple tool, `Tools/Editor.html`, is included to help you add new stations or create your own database from scratch.

## Installation

Follow these steps to install the plugin:

1.  Place the plugin files into your FM-DX-Webserver's `/plugins` directory.
2.  Restart the FM-DX-Webserver.
3.  Log in to the administrator panel and enable the **AM-Station-Info** plugin.
4.  Restart the server one more time. This allows the server to load the station database into memory.

You are now ready to fully explore the AM band!

## Important: Using the Database Editor

If you use the included `Tools/Editor.html` to add new stations or create a new database, you must rename the output file for the server to recognize it.

*   The default filename from the editor will look like this: `user_2025-09-18_10-55.json`.
*   **You must change this filename.** It is recommended to keep it short and simple (max 5 letters/numbers is ideal).
*   The filename **must** start with `user-` and end with `.json`.

**Example of a good filename:**
`user-0925.json`

You can also use your personal call sign or signature, for example: `user-mycall.json`.
