// Builds the Fire TV app (maia-tv/) and puts it in maia-fe/public, so the TV
// downloads it from MAIA itself: in the Downloader app, http://192.168.1.6:3001/maia-tv.apk
//
//   npm run tv:apk                         address http://192.168.1.6:3001
//   npm run tv:apk -- http://altro:3001    another default address
//
// Uses the JDK and Android SDK in %LOCALAPPDATA%\maia-android (docs/tv-app.md).
// With `npm run prod:local` running, restart it to serve the new file (dev serves it at once).
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tv = path.join(root, 'maia-tv');
const toolchain = path.join(process.env.LOCALAPPDATA ?? '', 'maia-android');
const jdk = path.join(toolchain, 'jdk');
if (!existsSync(jdk)) {
  console.error(`JDK non trovato in ${jdk}: vedi docs/tv-app.md.`);
  process.exit(1);
}
const url = process.argv[2];
const gradlew = path.join(tv, process.platform === 'win32' ? 'gradlew.bat' : 'gradlew');
const args = ['assembleRelease', '--console=plain', '-q', ...(url ? [`-PmaiaUrl=${url}`] : [])];
const r = spawnSync(gradlew, args, {
  cwd: tv,
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: { ...process.env, JAVA_HOME: jdk },
});
// The Gradle daemon would stay in memory afterwards: stop it.
spawnSync(gradlew, ['--stop', '-q'], {
  cwd: tv,
  stdio: 'ignore',
  shell: process.platform === 'win32',
  env: { ...process.env, JAVA_HOME: jdk },
});
if (r.status !== 0) process.exit(r.status ?? 1);

const apk = path.join(tv, 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk');
copyFileSync(apk, path.join(root, 'maia-fe', 'public', 'maia-tv.apk'));
console.log('APK pronto: http://192.168.1.6:3001/maia-tv.apk');
