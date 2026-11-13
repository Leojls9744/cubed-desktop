# CUBED desktop installers

Native installers for CUBED (Windows `.exe`, macOS `.dmg`, Linux `.AppImage`), built by GitHub Actions and published on this repo's **Releases** page.

Latest installers: `https://github.com/Leojls9744/cubed-desktop/releases/latest`

## Make a release

1. Open the **Actions** tab and pick **Release installers**.
2. Click **Run workflow**, then the green **Run workflow** button.

About ten minutes later the installers for Windows, macOS and Linux are on the Releases page. The release is named after `version` in `package.json` (`v1.0.0` for `1.0.0`); raise that number before publishing the next one. Running it again for the same version replaces that release's installers.

If a release comes out without the Mac `.dmg` files, GitHub had no Mac build machine free. Open that run under **Actions** and click **Re-run failed jobs**; the Mac installers are added to the same release.

Every push to `main` also builds the installers without publishing them, so a broken build shows up straight away. Pushing a tag such as `v1.0.1` publishes too, with the tag as the version number.

The app opens the address in `cubed.url` in `package.json`. Change it there if CUBED moves to a new address.

## What the desktop app adds

- Its own window, taskbar/dock icon and Start menu entry.
- Registers for `.docx .txt .md .xlsx .csv .xls .ods .pptx .pdf .tif .tiff .png .jpg .webp .gif .bmp`, so you can pick **CUBED** under *Open with* and set it as the default app.
- Files opened from the OS save back to the same file with Ctrl+S.
- Works offline after the first launch.

## Updates

- **Windows and Linux** update themselves (from version 1.0.2 on). The app checks this repo's latest release when it starts and every six hours, downloads a newer version in the background and installs it when the app quits. It reads `latest.yml` / `latest-linux.yml` from the release, so those files must stay in every release (the workflow uploads them).
- **Mac** cannot update itself without a paid Apple signing certificate. The app checks the latest release instead and shows a "new version available" button that downloads the new `.dmg`.
- Versions 1.0.0 and 1.0.1 have no updater: those users install 1.0.2 or later once by hand (the app shows them the same button).

## Signing in

Passkeys and Google sign-in do not work inside an app window, so **Sign in** opens a small browser window (Chrome, Edge or Brave if installed, otherwise a tab in the default browser). Sign in there with Internet Identity and the window closes; the app is signed in.

How it works: the app makes a key pair and keeps the private half. It opens CUBED's sign-in page with the public half and listens on `127.0.0.1` (this computer only) on a random port, with a one-time code. The page signs in, extends the session to the app's key, and sends it back to that address. `main.js` checks the code and passes the session to the app. The session is useless without the private key, which never leaves the app.

## Notes

- The installers are not code-signed, so Windows SmartScreen and macOS Gatekeeper ask for confirmation on first run. Signing needs a paid certificate (Windows) or an Apple Developer account (macOS).
- macOS has two downloads: `arm64` for Apple Silicon Macs and `x64` for Intel Macs.
- Phones and tablets: open CUBED in the browser and choose **Install app** / **Add to Home Screen**.
- Run locally: `npm install && CUBED_URL=https://your-app npm start`.
