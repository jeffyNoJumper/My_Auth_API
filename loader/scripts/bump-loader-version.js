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

function parseArgs(argv) {
    const parsed = {
        dryRun: false,
        mode: 'sync',
        version: null
    };

    for (let index = 0; index < argv.length; index += 1) {
        const token = argv[index];

        if (token === '--dry-run') {
            parsed.dryRun = true;
            continue;
        }

        if (token === '--patch') {
            parsed.mode = 'patch';
            continue;
        }

        if (token === '--sync') {
            parsed.mode = 'sync';
            continue;
        }

        if (token === '--set') {
            parsed.mode = 'set';
            parsed.version = argv[index + 1] || '';
            index += 1;
            continue;
        }

        if (!token.startsWith('--')) {
            parsed.mode = 'set';
            parsed.version = token;
        }
    }

    return parsed;
}

function normalizeVersion(version) {
    const clean = String(version || '').trim().replace(/^v/i, '');
    if (!/^\d+\.\d+\.\d+$/.test(clean)) {
        throw new Error(`Unsupported version format: ${version}`);
    }

    return clean;
}

function main() {
    const args = parseArgs(process.argv.slice(2));
    const dryRun = args.dryRun;

    const loaderPackage = readJson(loaderPackagePath);
    const currentVersion = loaderPackage.version;
    let nextVersion = currentVersion;

    if (args.mode === 'patch') {
        nextVersion = bumpPatchVersion(currentVersion);
    } else if (args.mode === 'set') {
        nextVersion = normalizeVersion(args.version);
    }

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

    const actionLabel = currentVersion === nextVersion ? 'Synced' : 'Updated';
    console.log(`[VERSION] ${dryRun ? 'Preview' : actionLabel} loader version ${currentVersion} -> ${nextVersion}`);
    console.log(`[VERSION] Manifest URL: ${manifest.url}`);
    console.log(`[VERSION] version.txt: ${versionManifestPath}`);
}

try {
    main();
} catch (error) {
    console.error(`[VERSION ERROR] ${error.message}`);
    process.exit(1);
}
