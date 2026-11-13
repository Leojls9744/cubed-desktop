// macOS only: give the app an ad-hoc signature. Apple Silicon Macs refuse to
// start an app with no signature at all ("is damaged"). This is not a paid
// Developer ID signature, so Gatekeeper still asks the user to confirm.
const { execFileSync } = require("node:child_process");
const path = require("node:path");

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== "darwin") return;
  const app = path.join(
    context.appOutDir,
    `${context.packager.appInfo.productFilename}.app`,
  );
  execFileSync("codesign", ["--force", "--deep", "--sign", "-", app], {
    stdio: "inherit",
  });
};
