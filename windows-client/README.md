# El Barzily for Windows

This is an online Electron wrapper for the published El Barzily website. It does not bundle the server, database, player records, or an offline copy of the site. Internet access is required.

The main window only navigates to HTTPS on the El Barzily site and the trusted Manus login host. Other HTTPS links, email links, and telephone links are opened with the default Windows handler. Node integration is disabled, context isolation and sandboxing are enabled, and only geolocation is requested for the trusted application origin.

## Build the x64 installer

From this directory, install the pinned npm dependencies and build the NSIS installer:

```sh
npm ci
npm run dist:win
```

The installer is written to `release/`. The Windows installer uses NSIS, creates Start Menu and desktop shortcuts, allows an installation directory choice, and preserves local app data when uninstalled.

The installer is intentionally not Authenticode-signed. Windows may show an unknown-publisher/SmartScreen notice. The application itself always loads the live HTTPS website; it is not an offline or standalone server app.
