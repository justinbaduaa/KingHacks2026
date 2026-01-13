const fs = require("fs");
const path = require("path");
const record = require("node-record-lpcm16");
const {
  TranscribeStreamingClient,
  StartStreamTranscriptionCommand,
} = require("@aws-sdk/client-transcribe-streaming");
const { CognitoIdentityClient } = require("@aws-sdk/client-cognito-identity");
const { fromCognitoIdentityPool } = require("@aws-sdk/credential-providers");

const RECORD_SECONDS = Number(process.env.RECORD_SECONDS || 5);
const CONFIG_PATH = path.join(__dirname, "..", "auth.config.json");

function loadConfig() {
  const raw = fs.readFileSync(CONFIG_PATH, "utf-8");
  return JSON.parse(raw);
}

function decodeJwt(token) {
  const payload = token.split(".")[1];
  if (!payload) {
    return {};
  }
  const padded = payload + "=".repeat((4 - (payload.length % 4)) % 4);
  return JSON.parse(Buffer.from(padded, "base64").toString("utf-8"));
}

function resolveUserPoolProvider(iss) {
  if (!iss) {
    return "";
  }
  const url = new URL(iss);
  const userPoolId = url.pathname.replace("/", "");
  if (!userPoolId) {
    return "";
  }
  return `${url.host}/${userPoolId}`;
}

function buildCredentials(config) {
  const idToken = process.env.COGNITO_ID_TOKEN;
  if (!idToken) {
    return undefined;
  }
  const claims = decodeJwt(idToken);
  const provider = resolveUserPoolProvider(claims.iss);
  if (!provider) {
    throw new Error("Unable to derive Cognito provider from COGNITO_ID_TOKEN");
  }
  return fromCognitoIdentityPool({
    client: new CognitoIdentityClient({ region: config.region }),
    identityPoolId: config.identityPoolId,
    logins: {
      [provider]: idToken,
    },
  });
}

async function main() {
  const config = loadConfig();
  const sampleRate = Number(process.env.TRANSCRIBE_SAMPLE_RATE || config.transcribeSampleRate || 16000);
  const languageCode = process.env.TRANSCRIBE_LANGUAGE_CODE || config.transcribeLanguageCode || "en-US";

  const credentials = buildCredentials(config);
  const client = new TranscribeStreamingClient({
    region: config.region,
    credentials,
  });

  const rec = record.record({
    sampleRate,
    channels: 1,
    audioType: "raw",
    verbose: false,
  });

  const abortController = new AbortController();
  const audioStream = async function* audioGenerator() {
    for await (const chunk of rec.stream()) {
      if (!chunk || chunk.length === 0) {
        continue;
      }
      yield { AudioEvent: { AudioChunk: chunk } };
    }
  };

  const command = new StartStreamTranscriptionCommand({
    LanguageCode: languageCode,
    MediaEncoding: "pcm",
    MediaSampleRateHertz: sampleRate,
    AudioStream: audioStream(),
  });

  console.log(`[NODE_TX] Recording ${RECORD_SECONDS}s @ ${sampleRate}Hz`);
  console.log(`[NODE_TX] Language=${languageCode} Region=${config.region}`);
  if (process.env.COGNITO_ID_TOKEN) {
    console.log("[NODE_TX] Using Cognito identity token");
  } else {
    console.log("[NODE_TX] Using default AWS credential chain");
  }

  const finals = [];
  const timeout = setTimeout(() => {
    rec.stop();
  }, Math.max(1, RECORD_SECONDS) * 1000);

  const hardTimeout = setTimeout(() => {
    abortController.abort();
  }, Math.max(1, RECORD_SECONDS) * 1000 + 6000);

  try {
    const response = await client.send(command, {
      abortSignal: abortController.signal,
    });

    for await (const event of response.TranscriptResultStream) {
      const results = event.TranscriptEvent?.Transcript?.Results || [];
      for (const result of results) {
        const alternative = result.Alternatives?.[0];
        if (!alternative?.Transcript) {
          continue;
        }
        if (result.IsPartial) {
          process.stdout.write(`\r[partial] ${alternative.Transcript}`);
        } else {
          process.stdout.write("\n");
          console.log(`[final] ${alternative.Transcript}`);
          finals.push(alternative.Transcript);
        }
      }
    }
  } catch (err) {
    if (err?.name === "AbortError") {
      console.warn("[NODE_TX] Stream aborted.");
    } else {
      console.error("[NODE_TX] Stream error:", err?.message || err);
      if (!process.env.COGNITO_ID_TOKEN && !process.env.AWS_ACCESS_KEY_ID) {
        console.error("[NODE_TX] Missing credentials. Set AWS_* env vars or COGNITO_ID_TOKEN.");
      }
    }
  } finally {
    clearTimeout(timeout);
    clearTimeout(hardTimeout);
    rec.stop();
  }

  if (finals.length > 0) {
    console.log("\n[NODE_TX] Final transcript:");
    console.log(finals.join(" "));
  } else {
    console.log("\n[NODE_TX] No final transcript received.");
  }
}

main().catch((err) => {
  console.error("[NODE_TX] Failed:", err);
  process.exitCode = 1;
});

