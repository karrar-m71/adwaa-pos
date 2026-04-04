import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const bindingPath = 'node_modules/better-sqlite3/build/Release/better_sqlite3.node';

function fail(message) {
  console.error(`\n[windows-build-check] ${message}\n`);
  process.exit(1);
}

if (process.platform !== 'win32') {
  fail(
    [
      'Windows builds must be created on Windows for this project.',
      'The app depends on better-sqlite3, which ships a native binary that must match the target OS and CPU.',
      `Current host: ${process.platform} ${process.arch}.`,
      'Build the installer from a Windows machine, then run: npm run desktop:build',
    ].join('\n')
  );
}

if (!existsSync(bindingPath)) {
  fail(`Missing native SQLite binding at: ${bindingPath}`);
}

let fileDescription = '';

try {
  fileDescription = execFileSync('file', [bindingPath], { encoding: 'utf8' }).trim();
} catch (error) {
  fail(`Unable to inspect native SQLite binding: ${error.message}`);
}

if (/Mach-O|ELF/i.test(fileDescription)) {
  fail(
    [
      'Detected a non-Windows native SQLite binary.',
      fileDescription,
      'Reinstall dependencies on Windows so better-sqlite3 is rebuilt for Windows, then rebuild the app.',
    ].join('\n')
  );
}

console.log(`[windows-build-check] Native binding looks compatible: ${fileDescription}`);
