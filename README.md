# AM-Station-Info Plugin for FM-DX-Webserver

![Version](https://img.shields.io/badge/version-2.0-blue)
![Compatibility](https://img.shields.io/badge/fm--dx--webserver-v1.4.0b-brightgreen)
![License](https://img.shields.io/badge/license-MIT-green)

## About

**AM-Station-Info** is a plugin for the [FM-DX-Webserver](https://github.com/NoobishSVK/fm-dx-webserver) that enhances your AM band exploration by providing detailed information for AM radio stations. It replaces the standard station ID panel with a comprehensive overview of the tuned station.

The plugin utilizes a local database, ensuring that station information is always available without relying on an internet connection. It comes pre-loaded with the AOKI database, a well-regarded resource for broadcast information.

### Major Update (V2.0)

- **New Admin Panel**: You can now easily configure all settings via the plugin's dedicated admin panel. If you are logged in as an admin, you will find a new shortcut button directly in the settings modal.
- **Automatic AOKI Updates**: You no longer need to worry about manually updating the AOKI list. The system now automatically fetches the latest database twice a day. *(This feature can be disabled in the settings if you prefer full manual control).*
- **Database Manager**: Managing your station lists is easier than ever. You can seamlessly import MWList data, upload your own databases, or even create and edit custom lists directly from the built-in editor.
- **Bug Fixes & Tweaks**: Implemented several under-the-hood fixes. We now use NOAA as the primary reliable source for the Kp-Index.
- **Improved Propagation Graph**: The propagation graph features a brand new design and improved calculation accuracy.
- **Distance Toggle**: Added a new feature allowing you to hide all distance calculations if you prefer not to use the server's physical location.
- **Enhanced Tuning Plugin Integration**: Added support for saving LW/MW favorites, allowing them to be visually displayed directly on the Analog Scale panel.
<br><br>
> **⚠️ Important Upgrade Notice**  
> In this update, we have reorganized the folder structure. It is highly recommended to **delete the old plugin files** before installing this update. *(Remember to back up any custom database lists you have created yourself before deleting!)*

---

<img width="826" height="397" alt="image" src="https://github.com/user-attachments/assets/4a67cc8d-45a6-434c-8862-b4afdf990962" />

<br><br>

## Features

This plugin displays the following information for AM stations:

*   **Station Name:** The name of the broadcasting station.
*   **Location:** The city and country of the transmitter.
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


