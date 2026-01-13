(() => {
  const SAMPLE_RATE = 16000;
  const CHANNELS = 1;

  const startBtn = document.getElementById("start-btn");
  const stopBtn = document.getElementById("stop-btn");
  const statusEl = document.getElementById("status");
  const detailEl = document.getElementById("detail");

  let stream = null;
  let audioContext = null;
  let processor = null;
  let zeroGain = null;
  let active = false;
  let chunks = [];

  function setStatus(status, detail) {
    statusEl.textContent = status;
    detailEl.textContent = detail || "";
  }

  function writeString(view, offset, value) {
    for (let i = 0; i < value.length; i += 1) {
      view.setUint8(offset + i, value.charCodeAt(i));
    }
  }

  function buildWav(bufferChunks, rate, channelCount) {
    const bytesPerSample = 2;
    const dataLength = bufferChunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
    const buffer = new ArrayBuffer(44 + dataLength);
    const view = new DataView(buffer);

    writeString(view, 0, "RIFF");
    view.setUint32(4, 36 + dataLength, true);
    writeString(view, 8, "WAVE");
    writeString(view, 12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, channelCount, true);
    view.setUint32(24, rate, true);
    view.setUint32(28, rate * channelCount * bytesPerSample, true);
    view.setUint16(32, channelCount * bytesPerSample, true);
    view.setUint16(34, 16, true);
    writeString(view, 36, "data");
    view.setUint32(40, dataLength, true);

    let offset = 44;
    bufferChunks.forEach((chunk) => {
      new Uint8Array(buffer, offset).set(new Uint8Array(chunk));
      offset += chunk.byteLength;
    });

    return buffer;
  }

  function downsample(input, inputRate, outputRate) {
    if (inputRate === outputRate) {
      return input;
    }
    const ratio = inputRate / outputRate;
    const newLength = Math.round(input.length / ratio);
    const result = new Float32Array(newLength);
    let offsetResult = 0;
    let offsetBuffer = 0;
    while (offsetResult < result.length) {
      const nextOffsetBuffer = Math.round((offsetResult + 1) * ratio);
      let accum = 0;
      let count = 0;
      for (let i = offsetBuffer; i < nextOffsetBuffer && i < input.length; i++) {
        accum += input[i];
        count += 1;
      }
      result[offsetResult] = count > 0 ? accum / count : 0;
      offsetResult += 1;
      offsetBuffer = nextOffsetBuffer;
    }
    return result;
  }

  function floatTo16BitPCM(float32Array) {
    const buffer = new ArrayBuffer(float32Array.length * 2);
    const view = new DataView(buffer);
    for (let i = 0; i < float32Array.length; i++) {
      let sample = Math.max(-1, Math.min(1, float32Array[i]));
      sample = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
      view.setInt16(i * 2, sample, true);
    }
    return buffer;
  }

  async function start() {
    if (active) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("getUserMedia not available");
    }

    chunks = [];
    setStatus("Recording...", "Requesting microphone");
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: CHANNELS, sampleRate: SAMPLE_RATE },
    });

    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    if (audioContext.state === "suspended") {
      await audioContext.resume();
    }
    const source = audioContext.createMediaStreamSource(stream);
    processor = audioContext.createScriptProcessor(4096, CHANNELS, CHANNELS);
    zeroGain = audioContext.createGain();
    zeroGain.gain.value = 0;

    source.connect(processor);
    processor.connect(zeroGain);
    zeroGain.connect(audioContext.destination);

    processor.onaudioprocess = (event) => {
      if (!active) {
        return;
      }
      const input = event.inputBuffer.getChannelData(0);
      const downsampled = downsample(input, audioContext.sampleRate, SAMPLE_RATE);
      const pcm = floatTo16BitPCM(downsampled);
      chunks.push(pcm);
    };

    active = true;
    startBtn.disabled = true;
    stopBtn.disabled = false;
    setStatus("Recording...", "Capturing audio");
  }

  async function stop() {
    if (!active) return;
    active = false;
    startBtn.disabled = false;
    stopBtn.disabled = true;

    if (processor) {
      processor.disconnect();
      processor = null;
    }
    if (zeroGain) {
      zeroGain.disconnect();
      zeroGain = null;
    }
    if (audioContext) {
      await audioContext.close();
      audioContext = null;
    }
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      stream = null;
    }

    setStatus("Saving...", `${chunks.length} chunks`);
    const wavBuffer = buildWav(chunks, SAMPLE_RATE, CHANNELS);
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `recording-${timestamp}.wav`;
    const result = await window.recorder.saveAudio(wavBuffer, filename);
    setStatus("Saved", result?.path || "Saved");
  }

  startBtn.addEventListener("click", () => {
    start().catch((err) => {
      console.error("[REC_MIN] Start failed:", err);
      setStatus("Error", err?.message || "Failed to start");
    });
  });

  stopBtn.addEventListener("click", () => {
    stop().catch((err) => {
      console.error("[REC_MIN] Stop failed:", err);
      setStatus("Error", err?.message || "Failed to stop");
    });
  });

  setStatus("Idle", "Ready");
})();
