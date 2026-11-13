# CUBED desktop installers

Native installers for CUBED (Windows `.exe`, macOS `.dmg`, Linux `.AppImage`), built by GitHub Actions and published on this repo's **Releases** page.

## One-time setup

1. Publish CUBED live in Caffeine and copy its address.
2. In this repo: **Settings > Secrets and variables > Actions > Variables > New variable**
   `CUBED_URL` = that address (for example `https://cubed.example.com`).

## Make a release

```
git tag v1.0.0
git push --tags
```

The **Release installers** workflow builds all three installers and attaches them to the release. Put the release link (`https://github.com/<you>/<repo>/releases/latest`) in CUBED > Settings > App setup > Installer download link.

## What the desktop app adds

- Its own window, taskbar/dock icon and Start menu entry.
- Registers for `.docx .txt .md .xlsx .csv .xls .ods .pptx .pdf .tif .tiff .png .jpg .webp .gif .bmp`, so you can pick **CUBED** under *Open with* and set it as the default app.
- Files opened from the OS save back to the same file with Ctrl+S.
- Works offline after the first launch.

## Notes

- The installers are not code-signed, so Windows SmartScreen and macOS Gatekeeper show a warning on first run. Signing needs a paid certificate (Windows) or an Apple Developer account (macOS).
- Phones and tablets: open CUBED in the browser and choose **Install app** / **Add to Home Screen**.
- Run locally: `npm install && CUBED_URL=https://your-app npm start`.
