/**
 * Independent Crunchyroll Token & User-Agent Extractor Script
 *
 * Checks for the latest Crunchyroll TV app version, downloads the APK,
 * decompiles it using JADX, extracts the client credentials and version,
 * and updates `src/constants/crunchyroll.ts` in place.
 *
 * Usage:
 *   bun run scripts/extract-crunchyroll-tokens.ts [--force]
 */

import { execSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { parseVersionTuple, compareVersions } from "../src/services/crunchyroll-credentials";
import { CRUNCHYROLL_USER_AGENT } from "../src/constants/crunchyroll";

const CONSTANTS_FILE_PATH = path.resolve(__dirname, "../src/constants/crunchyroll.ts");
const FORCE_UPDATE = process.argv.includes("--force");

interface AptoideItem {
    id: number;
    name: string;
    package: string;
    file?: {
        vername?: string;
        vercode?: number;
    };
}

async function searchLatestTvApk(): Promise<{ id: number; vername: string; vercode: number } | null> {
    const searchParams = new URLSearchParams();
    searchParams.append("query", "crunchyroll");
    searchParams.append("cdn", "web");
    searchParams.append("q", "bXlDUFU9YXJtNjQtdjhhLGFybWVhYmktdjdhLGFybWVhYmkmbGVhbmJhY2s9MA");
    searchParams.append("aab", "1");

    const searchUrl = `https://ws2-cache.aptoide.com/api/7/apps/search?${searchParams.toString()}`;
    const res = await fetch(searchUrl);
    if (!res.ok) {
        throw new Error(`Aptoide search request failed (HTTP ${res.status})`);
    }

    const json = (await res.json()) as { datalist?: { list?: AptoideItem[] } };
    const list = json.datalist?.list || [];

    // Find the main Crunchyroll app package
    const app = list.find(item => item.package === "com.crunchyroll.crunchyroid" && item.id && item.file?.vername);

    if (!app || !app.file?.vername || !app.file?.vercode) {
        return null;
    }

    return {
        id: app.id,
        vername: app.file.vername,
        vercode: app.file.vercode
    };
}

async function getApkDownloadUrl(appId: number): Promise<string> {
    const body = new FormData();
    body.append("identif", `id:${appId}`);
    body.append("mode", "json");

    const res = await fetch("https://webservices.aptoide.com/webservices/3/getApkInfo", {
        method: "POST",
        body
    });

    if (!res.ok) {
        throw new Error(`getApkInfo failed (HTTP ${res.status})`);
    }

    const json = (await res.json()) as { apk?: { path?: string } };
    if (!json.apk?.path) {
        throw new Error("getApkInfo response missing apk.path");
    }

    return json.apk.path;
}

function walkDir(dir: string): string[] {
    let results: string[] = [];
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            results = results.concat(walkDir(fullPath));
        } else if (entry.isFile() && (entry.name.endsWith(".java") || entry.name.endsWith(".kt"))) {
            results.push(fullPath);
        }
    }
    return results;
}

function findCredentialsInSources(sourcesDir: string): { id: string; secret: string } | null {
    // 1. Try legacy Constants.java
    const constantsPath = path.join(sourcesDir, "com", "crunchyroll", "api", "util", "Constants.java");
    if (fs.existsSync(constantsPath)) {
        const content = fs.readFileSync(constantsPath, "utf8");
        const idMatch = content.match(/PROD_CLIENT_ID\s*=\s*"([^"]+)"/);
        const secretMatch = content.match(/PROD_CLIENT_SECRET\s*=\s*"([^"]+)"/);
        if (idMatch?.[1] && secretMatch?.[1]) {
            return { id: idMatch[1], secret: secretMatch[1] };
        }
    }

    // 2. Search for ConfigurationImpl or files containing sso.crunchyroll.com
    const allFiles = walkDir(sourcesDir);
    for (const filePath of allFiles) {
        const content = fs.readFileSync(filePath, "utf8");
        if (content.includes("https://sso.crunchyroll.com")) {
            const lines = content.split("\n");
            const ssoIdx = lines.findIndex(l => l.includes("https://sso.crunchyroll.com"));
            if (ssoIdx !== -1) {
                // In Kotlin ConfigurationImpl, the client ID and secret follow the SSO URL
                const nextLines = lines.slice(ssoIdx, ssoIdx + 15);
                const stringLiterals: string[] = [];
                for (const line of nextLines) {
                    const match = line.match(/"([A-Za-z0-9_-]{15,50})"/);
                    if (match?.[1]) {
                        stringLiterals.push(match[1]);
                    }
                }
                if (stringLiterals.length >= 2) {
                    return { id: stringLiterals[0]!, secret: stringLiterals[1]! };
                }
            }
        }
    }

    return null;
}

async function ensureJadx(): Promise<string> {
    // 1. Check if jadx is in PATH
    try {
        const cmd = process.platform === "win32" ? "where jadx" : "which jadx";
        const found = execSync(cmd, { stdio: "pipe" }).toString().trim();
        if (found) return "jadx";
    } catch {
        // Not in PATH
    }

    // 2. Check cached portable JADX
    const jadxDir = path.join(os.tmpdir(), "jadx-bin");
    const jadxBin =
        process.platform === "win32" ? path.join(jadxDir, "bin", "jadx.bat") : path.join(jadxDir, "bin", "jadx");

    if (fs.existsSync(jadxBin)) {
        return `"${jadxBin}"`;
    }

    // 3. Auto-download portable JADX
    console.log("📦 JADX not found in PATH. Auto-downloading portable JADX...");
    fs.mkdirSync(jadxDir, { recursive: true });

    const releaseRes = await fetch("https://api.github.com/repos/skylot/jadx/releases/latest");
    if (!releaseRes.ok) {
        throw new Error(`Failed to fetch JADX release info from GitHub (HTTP ${releaseRes.status})`);
    }

    const releaseJson = (await releaseRes.json()) as {
        assets?: Array<{ name: string; browser_download_url: string }>;
    };
    const asset = releaseJson.assets?.find(a => a.name.startsWith("jadx-") && !a.name.includes("gui"));

    if (!asset) {
        throw new Error("Could not find standard JADX CLI zip asset in GitHub release.");
    }

    console.log(`⬇️ Downloading JADX CLI (${asset.name})...`);
    const zipRes = await fetch(asset.browser_download_url);
    if (!zipRes.ok) {
        throw new Error(`Failed to download JADX zip (HTTP ${zipRes.status})`);
    }

    const zipBuffer = await zipRes.arrayBuffer();
    const zipPath = path.join(os.tmpdir(), "jadx-download.zip");
    fs.writeFileSync(zipPath, Buffer.from(zipBuffer));

    console.log("📦 Extracting JADX...");
    try {
        execSync(`tar -xf "${zipPath}" -C "${jadxDir}"`, { stdio: "inherit" });
    } finally {
        try {
            fs.unlinkSync(zipPath);
        } catch {
            // Ignore
        }
    }

    if (process.platform !== "win32") {
        try {
            execSync(`chmod +x "${jadxBin}"`);
        } catch {
            // Ignore
        }
    }

    console.log("✅ JADX ready!");
    return `"${jadxBin}"`;
}

async function main(): Promise<void> {
    console.log("🔍 Checking Aptoide for latest Crunchyroll Android TV APK...");
    const appInfo = await searchLatestTvApk();

    if (!appInfo) {
        console.error("❌ Failed to find Crunchyroll APK metadata on Aptoide.");
        process.exit(1);
    }

    const currentTuple = parseVersionTuple(CRUNCHYROLL_USER_AGENT);
    const remoteVersionFormatted = `${appInfo.vername}_${appInfo.vercode}`;
    const versionDiff = compareVersions(
        remoteVersionFormatted,
        `${currentTuple[0]}.${currentTuple[1]}.${currentTuple[2]}_${currentTuple[3]}`
    );

    console.log(`📦 Remote version: ${remoteVersionFormatted}`);
    console.log(`💻 Current active version: ${currentTuple.join(".")}`);

    if (versionDiff <= 0 && !FORCE_UPDATE) {
        console.log("✅ Current Crunchyroll credentials are already up-to-date. No update needed.");
        return;
    }

    console.log("⬇️ Fetching APK download URL...");
    const apkUrl = await getApkDownloadUrl(appInfo.id);

    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "cr-extract-"));
    const apkPath = path.join(tempDir, "crunchyroll.apk");
    const decompileDir = path.join(tempDir, "decompiled");

    try {
        console.log(`⬇️ Downloading APK (${apkUrl})...`);
        const res = await fetch(apkUrl);
        if (!res.ok) throw new Error(`Download failed (HTTP ${res.status})`);
        const buffer = await res.arrayBuffer();
        fs.writeFileSync(apkPath, Buffer.from(buffer));
        console.log(`✅ Downloaded ${(fs.statSync(apkPath).size / 1024 / 1024).toFixed(2)} MB`);

        const jadxCmd = await ensureJadx();
        console.log("⚙️ Decompiling APK with JADX (sources only)...");
        execSync(`${jadxCmd} --no-res -d "${decompileDir}" "${apkPath}"`, {
            stdio: "ignore"
        });

        console.log("🔍 Parsing client credentials from decompiled sources...");
        const sourcesDir = path.join(decompileDir, "sources");
        const creds = findCredentialsInSources(sourcesDir);

        if (!creds) {
            throw new Error("Failed to find Crunchyroll client_id & client_secret in decompiled sources.");
        }

        const basicAuth = Buffer.from(`${creds.id}:${creds.secret}`).toString("base64");
        const userAgent = `Crunchyroll/ANDROIDTV/${appInfo.vername}_${appInfo.vercode} (Android 12; en-US; SHIELD Android TV Build/SR1A.220624.014)`;

        console.log("\n================ EXTRACTED CREDENTIALS ================");
        console.log(`Client ID:     ${creds.id}`);
        console.log(`Client Secret: ${creds.secret}`);
        console.log(`Basic Auth:    ${basicAuth}`);
        console.log(`User-Agent:    ${userAgent}`);
        console.log("========================================================\n");

        console.log(`✏️ Updating ${CONSTANTS_FILE_PATH}...`);
        let constantsContent = fs.readFileSync(CONSTANTS_FILE_PATH, "utf8");

        constantsContent = constantsContent.replace(
            /export const CRUNCHYROLL_BASIC_AUTH\s*=\s*"[^"]+";/,
            `export const CRUNCHYROLL_BASIC_AUTH = "${basicAuth}";`
        );
        constantsContent = constantsContent.replace(
            /export const CRUNCHYROLL_USER_AGENT\s*=\s*\n?\s*"[^"]+";/,
            `export const CRUNCHYROLL_USER_AGENT =\n    "${userAgent}";`
        );

        fs.writeFileSync(CONSTANTS_FILE_PATH, constantsContent);
        console.log("✨ Successfully updated constants file!");

        try {
            execSync(`bunx oxfmt "${CONSTANTS_FILE_PATH}"`, { stdio: "ignore" });
        } catch {
            // Ignore formatting error
        }
    } finally {
        console.log("🧹 Cleaning up temporary files...");
        try {
            fs.rmSync(tempDir, { recursive: true, force: true });
        } catch {
            // Ignore
        }
    }
}

main().catch(err => {
    console.error("❌ Extraction script failed:", err);
    process.exit(1);
});
