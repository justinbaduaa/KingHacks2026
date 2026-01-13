const fs = require("fs");
const path = require("path");
const record = require("node-record-lpcm16");

const OUTPUT_DIR = path.join(__dirname, "recordings");
const RECORD_SECONDS = Number(process.env.RECORD_SECONDS || 5);

async function ensureDir(dir) {
  await fs.promises.mkdir(dir, { recursive: true });
}

async function main() {
  await ensureDir(OUTPUT_DIR);

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `recording-${timestamp}.wav`;
  const outputPath = path.join(OUTPUT_DIR, filename);
  const file = fs.createWriteStream(outputPath, { encoding: "binary" });

  console.log(`[NODE_REC] Recording ${RECORD_SECONDS}s -> ${outputPath}`);

  const rec = record.record({
    sampleRate: 16000,
    channels: 1,
    audioType: "wav",
    verbose: false,
  });

  rec.stream().pipe(file);

  setTimeout(() => {
    rec.stop();
    console.log("[NODE_REC] Stopped.");
  }, Math.max(1, RECORD_SECONDS) * 1000);
}

main().catch((err) => {
  console.error("[NODE_REC] Failed:", err);
  process.exitCode = 1;
});

