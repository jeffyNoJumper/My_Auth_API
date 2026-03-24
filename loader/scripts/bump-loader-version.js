const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const loaderPackagePath = path.join(repoRoot, 'loader', 'package.json');
const loaderPackageLockPath = path.join(repoRoot, 'loader', 'package-lock.json');
const versionManifestPath = path.join(repoRoot, 'version.txt');

const RELEASE_REPO = 'jeffyNoJumper/My_Auth_API';
const INSTALLER_BASENAME = 'VEXION.ALL-IN-ONE.Setup';

function readJson(filePath) {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, value) {
    fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function bumpPatchVersion(version) {
    const match = String(version || '').trim().match(/^(\d+)\.(\d+)\.(\d+)$/);
    if (!match) {
        throw new Error(`Unsupported version format: ${version}`);
    }

    const [, major, minor, patch] = match;
    return `${major}.${minor}.${Number.parseInt(patch, 10) + 1}`;
}

function buildReleaseUrl(version) {
    const installerName = `${INSTALLER_BASENAME}.${version}.exe`;
    return `https://github.com/${RELEASE_REPO}/releases/download/v${version}/${installerName}`;
}

function main() {
    const dryRun = process.argv.includes('--dry-run');

    const loaderPackage = readJson(loaderPackagePath);
    const currentVersion = loaderPackage.version;
    const nextVersion = bumpPatchVersion(currentVersion);

    const manifest = {
        version: nextVersion,
        url: buildReleaseUrl(nextVersion)
    };

    if (!dryRun) {
        loaderPackage.version = nextVersion;
        writeJson(loaderPackagePath, loaderPackage);

        if (fs.existsSync(loaderPackageLockPath)) {
            const loaderPackageLock = readJson(loaderPackageLockPath);
            loaderPackageLock.version = nextVersion;

            if (loaderPackageLock.packages && loaderPackageLock.packages['']) {
                loaderPackageLock.packages[''].version = nextVersion;
            }

            writeJson(loaderPackageLockPath, loaderPackageLock);
        }

        writeJson(versionManifestPath, manifest);
    }

    console.log(`[VERSION] ${dryRun ? 'Preview' : 'Updated'} loader version ${currentVersion} -> ${nextVersion}`);
    console.log(`[VERSION] Manifest URL: ${manifest.url}`);
    console.log(`[VERSION] version.txt: ${versionManifestPath}`);
}

try {
    main();
} catch (error) {
    console.error(`[VERSION ERROR] ${error.message}`);
    process.exit(1);
}
