const {
  TranscribeStreamingClient,
  StartStreamTranscriptionCommand,
} = require("@aws-sdk/client-transcribe-streaming");
const { CognitoIdentityClient } = require("@aws-sdk/client-cognito-identity");
const { fromCognitoIdentityPool } = require("@aws-sdk/credential-providers");
const { EventEmitter } = require("events");

const { ensureValidTokens, loadConfig } = require("./auth");

const DEFAULT_LANGUAGE_CODE = "en-US";
const DEFAULT_SAMPLE_RATE = 16000;

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

class TranscribeSession extends EventEmitter {
  constructor() {
    super();
    this.active = false;
    this.queue = [];
    this.waiters = [];
    this.client = null;
    this.abortController = null;
    this.ended = false;
    this.streamPromise = null;
    this.readyForAudio = false;
  }

  enqueue(chunk) {
    if (!this.active || this.ended || !this.readyForAudio || !chunk) {
      return;
    }
    if (this.waiters.length > 0) {
      const waiter = this.waiters.shift();
      waiter(chunk);
      return;
    }
    this.queue.push(chunk);
  }

  async _nextChunk() {
    if (this.queue.length > 0) {
      return this.queue.shift();
    }
    return new Promise((resolve) => this.waiters.push(resolve));
  }

  async *_audioStream() {
    while (this.active) {
      const chunk = await this._nextChunk();
      if (!this.active || this.ended) {
        break;
      }
      if (!chunk) {
        continue;
      }
      yield { AudioEvent: { AudioChunk: chunk } };
    }
  }

  _clearWaiters() {
    while (this.waiters.length > 0) {
      const waiter = this.waiters.shift();
      waiter(null);
    }
  }

  _markEnded() {
    if (this.ended) {
      return;
    }
    this.active = false;
    this.ended = true;
    this.readyForAudio = false;
    this.queue = [];
    this._clearWaiters();
    this.emit("ended");
  }

  async start() {
    if (this.active) {
      return true;
    }

    const tokens = await ensureValidTokens().catch(() => null);
    const idToken = tokens?.id_token;
    if (!idToken) {
      throw new Error("Missing Cognito id token for Transcribe");
    }

    const config = loadConfig();
    const region = config.region;
    const identityPoolId = config.identityPoolId;
    if (!region || !identityPoolId) {
      throw new Error("Missing region or identityPoolId in auth.config.json");
    }
    console.log(`[TRANSCRIBE] Using region=${region} identityPoolId=${identityPoolId}`);

    const claims = decodeJwt(idToken);
    const provider = resolveUserPoolProvider(claims.iss);
    if (!provider) {
      throw new Error("Unable to derive Cognito user pool provider from token");
    }
    console.log(`[TRANSCRIBE] Using provider=${provider}`);

    const credentials = fromCognitoIdentityPool({
      client: new CognitoIdentityClient({ region }),
      identityPoolId,
      logins: {
        [provider]: idToken,
      },
    });

    this.client = new TranscribeStreamingClient({ region, credentials });
    this.abortController = new AbortController();
    this.active = true;
    this.ended = false;
    this.readyForAudio = false;

    const command = new StartStreamTranscriptionCommand({
      LanguageCode: config.transcribeLanguageCode || DEFAULT_LANGUAGE_CODE,
      MediaEncoding: "pcm",
      MediaSampleRateHertz: config.transcribeSampleRate || DEFAULT_SAMPLE_RATE,
      AudioStream: this._audioStream(),
    });

    this.streamPromise = this._runStream(command);
    return true;
  }

  async _runStream(command) {
    try {
      console.log("[TRANSCRIBE] Starting stream...");
      const response = await this.client.send(command, {
        abortSignal: this.abortController.signal,
      });
      console.log("[TRANSCRIBE] Stream accepted.");
      this.readyForAudio = true;
      this.emit("ready");
      for await (const event of response.TranscriptResultStream) {
        const results = event.TranscriptEvent?.Transcript?.Results || [];
        for (const result of results) {
          const alternative = result.Alternatives?.[0];
          if (!alternative?.Transcript) {
            continue;
          }
          if (result.IsPartial) {
            console.log(`[TRANSCRIBE partial] ${alternative.Transcript}`);
          } else {
            console.log(`[TRANSCRIBE] ${alternative.Transcript}`);
          }
        }
      }
    } catch (err) {
      if (err?.name !== "AbortError") {
        console.error("Transcribe stream error:", err);
        this.emit("error", err);
      }
    } finally {
      this._markEnded();
    }
  }

  stop() {
    if (!this.active) {
      return;
    }
    this.active = false;
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    this._markEnded();
  }
}

function createTranscribeSession() {
  return new TranscribeSession();
}

module.exports = {
  createTranscribeSession,
};
