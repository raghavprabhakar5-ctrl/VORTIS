import { uploadFilesWithProgress } from "@huggingface/hub";
import fs from "fs";
import path from "path";

// ── CONFIG ──
const HF_TOKEN = "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"; 
const REPO_ID = "Raghav098/whisper-small-vortis";
const LOCAL_FOLDER = "C:\\Vortis\\vortis-vite\\public\\models\\whisper-small";

// ── Recursively collect all files with their relative paths ──
function collectFiles(dir, baseDir = dir) {
  let results = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results = results.concat(collectFiles(fullPath, baseDir));
    } else {
      const relativePath = path.relative(baseDir, fullPath).replace(/\\/g, "/");
      results.push({
        path: relativePath,
        content: new Blob([fs.readFileSync(fullPath)]),
      });
    }
  }
  return results;
}

async function main() {
  console.log("Collecting files from:", LOCAL_FOLDER);
  const files = collectFiles(LOCAL_FOLDER);
  console.log(`Found ${files.length} files:`);
  files.forEach(f => console.log(" -", f.path));

  console.log("\nStarting upload to:", REPO_ID);

  for await (const progressEvent of uploadFilesWithProgress({
    repo: { type: "model", name: REPO_ID },
    accessToken: HF_TOKEN,
    files,
  })) {
    console.log(
      `Progress: ${(progressEvent.progress * 100).toFixed(1)}% - ${progressEvent.state}`
    );
  }

  console.log("\n✅ Upload complete!");
}

main().catch(err => {
  console.error("❌ Upload failed:", err);
  process.exit(1);
});
