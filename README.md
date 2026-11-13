# CUBED desktop installers

Native installers for CUBED (Windows `.exe`, macOS `.dmg`, Linux `.AppImage`), built by GitHub Actions and published on this repo's **Releases** page.

Latest installers: `https://github.com/Leojls9744/cubed-desktop/releases/latest`

## Make a release

1. Open the **Actions** tab and pick **Release installers**.
2. Click **Run workflow**, then the green **Run workflow** button.

About ten minutes later the installers for Windows, macOS and Linux are on the Releases page. The release is named after `version` in `package.json` (`v1.0.0` for `1.0.0`); raise that number before publishing the next one. Running it again for the same version replaces that release's installers.

Every push to `main` also builds the installers without publishing them, so a broken build shows up straight away. Pushing a tag such as `v1.0.1` publishes too, with the tag as the version number.

The app opens the address in `cubed.url` in `package.json`. Change it there if CUBED moves to a new address.

## What the desktop app adds

- Its own window, taskbar/dock icon and Start menu entry.
- Registers for `.docx .txt .md .xlsx .csv .xls .ods .pptx .pdf .tif .tiff .png .jpg .webp .gif .bmp`, so you can pick **CUBED** under *Open with* and set it as the default app.
- Files opened from the OS save back to the same file with Ctrl+S.
- Works offline after the first launch.

## Notes

- The installers are not code-signed, so Windows SmartScreen and macOS Gatekeeper ask for confirmation on first run. Signing needs a paid certificate (Windows) or an Apple Developer account (macOS).
- macOS has two downloads: `arm64` for Apple Silicon Macs and `x64` for Intel Macs.
- Phones and tablets: open CUBED in the browser and choose **Install app** / **Add to Home Screen**.
- Run locally: `npm install && CUBED_URL=https://your-app npm start`.
