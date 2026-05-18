#!/usr/bin/env node
/**
 * Wrap the portable Windows binary into a .exe installer (Inno Setup).
 * Runs on Windows only — invoked by CI on a windows runner with Inno
 * Setup available (ISCC on PATH, e.g. `choco install innosetup`).
 *
 * Prerequisite: release/spearcode-win-x64.exe built by build-bin.mjs.
 */
import {
  mkdirSync, existsSync, writeFileSync, readFileSync,
} from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const VERSION = pkg.version;
const BIN = join(root, 'release', 'spearcode-win-x64.exe');
const OUT = join(root, 'release');
const buildDir = join(root, 'build');

if (!existsSync(BIN)) {
  console.error(`✗ Missing ${BIN}\n  Run: npm run build:bin -- node20-win-x64`);
  process.exit(1);
}
mkdirSync(buildDir, { recursive: true });

const iss = join(buildDir, 'spearcode.iss');
writeFileSync(iss,
`; SpearCode Windows installer (Inno Setup)
[Setup]
AppName=SpearCode
AppVersion=${VERSION}
AppPublisher=SpearCode
DefaultDirName={autopf}\\SpearCode
DefaultGroupName=SpearCode
DisableProgramGroupPage=yes
OutputDir=${OUT.replace(/\\/g, '\\\\')}
OutputBaseFilename=Spearcode-${VERSION}-windows-x64-setup
Compression=lzma2
SolidCompression=yes
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
ChangesEnvironment=yes
UninstallDisplayName=SpearCode

[Files]
Source: "${BIN.replace(/\\/g, '\\\\')}"; DestDir: "{app}"; DestName: "spearcode.exe"; Flags: ignoreversion

[Tasks]
Name: "addtopath"; Description: "Add SpearCode to PATH"; GroupDescription: "Integration:"

[Registry]
Root: HKLM; Subkey: "SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment"; \\
  ValueType: expandsz; ValueName: "Path"; ValueData: "{olddata};{app}"; \\
  Check: NeedsAddPath('{app}'); Tasks: addtopath

[Code]
function NeedsAddPath(Param: string): Boolean;
var OrigPath: string;
begin
  if not RegQueryStringValue(HKLM,
    'SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment',
    'Path', OrigPath) then begin Result := True; exit; end;
  Result := Pos(';' + Uppercase(Param) + ';', ';' + Uppercase(OrigPath) + ';') = 0;
end;
`);

execFileSync('iscc', [iss], { stdio: 'inherit' });
console.log(`\n✓ release/Spearcode-${VERSION}-windows-x64-setup.exe`);
