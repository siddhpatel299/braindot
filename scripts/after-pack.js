'use strict';

const fs = require('node:fs');
const path = require('node:path');

/**
 * Copy the assembled Next.js server into the packaged app.
 *
 * This is deliberately not an `extraResources` entry. electron-builder applies
 * its own file matcher to those, and that matcher drops `node_modules` — which
 * for this bundle is not incidental clutter but the server's entire dependency
 * tree. The package still builds, and the app then dies on launch. Copying here
 * skips the matcher completely, and asserts the result rather than trusting it.
 */
module.exports = async function afterPack(context) {
  const projectRoot = path.resolve(__dirname, '..');
  const source = path.join(projectRoot, 'desktop-build', 'server');
  const destination = path.join(resourcesDir(context), 'server');

  if (!fs.existsSync(path.join(source, 'server.js'))) {
    throw new Error(
      `No server bundle at ${source}. Run \`bun run desktop:build\` before packaging.`,
    );
  }

  fs.rmSync(destination, { recursive: true, force: true });
  fs.cpSync(source, destination, { recursive: true });

  // The failure this whole file exists to prevent.
  const modules = path.join(destination, 'node_modules');
  if (!fs.existsSync(modules) || fs.readdirSync(modules).length === 0) {
    throw new Error(`Packaged server has no node_modules at ${modules}.`);
  }

  // Belt and braces: the build script strips these, but an installer must never
  // carry env files, so verify at the last point where we can still fail loudly.
  for (const entry of fs.readdirSync(destination)) {
    if (entry === '.env' || entry.startsWith('.env.')) {
      throw new Error(`Refusing to package ${entry} — env files must not ship.`);
    }
  }

  const count = fs.readdirSync(modules).length;
  console.log(
    `  • bundled Next server copied  modules=${count} path=${path.relative(context.appOutDir, destination)}`,
  );
};

/**
 * Where `process.resourcesPath` will point at runtime.
 *
 * This differs per platform: Windows and Linux use `<appOutDir>/resources`,
 * while macOS buries it in the bundle at
 * `<appOutDir>/<Product>.app/Contents/Resources`. electron-builder knows the
 * answer, so ask it rather than rebuilding the path by hand; the fallback only
 * exists in case that internal helper moves.
 */
function resourcesDir(context) {
  const packager = context.packager;
  if (packager && typeof packager.getResourcesDir === 'function') {
    return packager.getResourcesDir(context.appOutDir);
  }

  if (context.electronPlatformName === 'darwin') {
    const product =
      (packager && packager.appInfo && packager.appInfo.productFilename) || 'braindot';
    return path.join(context.appOutDir, `${product}.app`, 'Contents', 'Resources');
  }
  return path.join(context.appOutDir, 'resources');
}
