const {
  TranscribeStreamingClient,
  StartStreamTranscriptionCommand,
} = require("@aws-sdk/client-transcribe-streaming");
const { CognitoIdentityClient } = require("@aws-sdk/client-cognito-identity");
const { fromCognitoIdentityPool } = require("@aws-sdk/credential-providers");

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

class TranscribeSession {
  constructor() {
    this.active = false;
    this.queue = [];
    this.waiters = [];
    this.client = null;
    this.abortController = null;
    this.ended = false;
  }

  enqueue(chunk) {
    if (!this.active || this.ended || !chunk) {
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

  async start() {
    if (this.active) {
      return;
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

    const claims = decodeJwt(idToken);
    const provider = resolveUserPoolProvider(claims.iss);
    if (!provider) {
      throw new Error("Unable to derive Cognito user pool provider from token");
    }

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

    const command = new StartStreamTranscriptionCommand({
      LanguageCode: config.transcribeLanguageCode || DEFAULT_LANGUAGE_CODE,
      MediaEncoding: "pcm",
      MediaSampleRateHertz: config.transcribeSampleRate || DEFAULT_SAMPLE_RATE,
      AudioStream: this._audioStream(),
    });

    try {
      const response = await this.client.send(command, {
        abortSignal: this.abortController.signal,
      });
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
      }
    } finally {
      this.active = false;
      this.ended = true;
      this._clearWaiters();
    }
  }

  stop() {
    if (!this.active) {
      return;
    }
    this.active = false;
    this.ended = true;
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    this._clearWaiters();
  }
}

function createTranscribeSession() {
  return new TranscribeSession();
}

module.exports = {
  createTranscribeSession,
};
