(() => {
  // TRANSCRIPTION CODE COMMENTED OUT
  // const TRANSCRIBE_SAMPLE_RATE = 16000;

  let audioContext = null;
  let analyser = null;
  let microphone = null;
  let mediaStream = null;
  let processor = null;
  let zeroGain = null;
  let animationFrameId = null;
  let active = false;
  let simulated = false;

  // TRANSCRIPTION CODE COMMENTED OUT
  // function downsampleBuffer(buffer, inputSampleRate, outputSampleRate) {
  //   if (outputSampleRate === inputSampleRate) {
  //     return buffer;
  //   }
  //   const ratio = inputSampleRate / outputSampleRate;
  //   const newLength = Math.round(buffer.length / ratio);
  //   const result = new Float32Array(newLength);
  //   let offsetResult = 0;
  //   let offsetBuffer = 0;
  //   while (offsetResult < result.length) {
  //     const nextOffsetBuffer = Math.round((offsetResult + 1) * ratio);
  //     let accum = 0;
  //     let count = 0;
  //     for (let i = offsetBuffer; i < nextOffsetBuffer && i < buffer.length; i++) {
  //       accum += buffer[i];
  //       count += 1;
  //     }
  //     result[offsetResult] = count > 0 ? accum / count : 0;
  //     offsetResult += 1;
  //     offsetBuffer = nextOffsetBuffer;
  //   }
  //   return result;
  // }

  // function floatTo16BitPCM(float32Array) {
  //   const buffer = new ArrayBuffer(float32Array.length * 2);
  //   const view = new DataView(buffer);
  //   for (let i = 0; i < float32Array.length; i++) {
  //     let sample = Math.max(-1, Math.min(1, float32Array[i]));
  //     sample = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
  //     view.setInt16(i * 2, sample, true);
  //   }
  //   return buffer;
  // }

  function startSimulation(onLoudness) {
    simulated = true;
    let phase = 0;
    function simulate() {
      if (!active || !simulated) return;
      const base = Math.sin(phase) * 0.3 + 0.4;
      const noise = (Math.random() - 0.5) * 0.4;
      const loudness = Math.max(0, Math.min(1, base + noise));
      onLoudness(loudness);
      phase += 0.15;
      animationFrameId = requestAnimationFrame(simulate);
    }
    simulate();
  }

  async function start({ onLoudness, onAudioChunk }) {
    if (active) {
      return;
    }
    active = true;
    simulated = false;

    try {
      mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });

      audioContext = new (window.AudioContext || window.webkitAudioContext)();
      analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.3;

      microphone = audioContext.createMediaStreamSource(mediaStream);
      microphone.connect(analyser);

      // TRANSCRIPTION CODE COMMENTED OUT
      // processor = audioContext.createScriptProcessor(4096, 1, 1);
      // zeroGain = audioContext.createGain();
      // zeroGain.gain.value = 0;
      // microphone.connect(processor);
      // processor.connect(zeroGain);
      // zeroGain.connect(audioContext.destination);
      // processor.onaudioprocess = (event) => {
      //   if (!onAudioChunk) {
      //     return;
      //   }
      //   const input = event.inputBuffer.getChannelData(0);
      //   const downsampled = downsampleBuffer(input, audioContext.sampleRate, TRANSCRIBE_SAMPLE_RATE);
      //   const pcm = floatTo16BitPCM(downsampled);
      //   onAudioChunk(pcm);
      // };

      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      function analyze() {
        if (!active) return;
        analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i];
        }
        const average = sum / dataArray.length;
        const loudness = Math.min(1, (average / 30) * 1.5);
        onLoudness(loudness);
        animationFrameId = requestAnimationFrame(analyze);
      }
      analyze();
    } catch (err) {
      console.error("Error accessing microphone:", err);
      startSimulation(onLoudness);
    }
  }

  function stop() {
    active = false;
    simulated = false;
    if (animationFrameId) {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = null;
    }
    if (mediaStream) {
      mediaStream.getTracks().forEach((track) => track.stop());
      mediaStream = null;
    }
    if (audioContext) {
      audioContext.close();
      audioContext = null;
    }
    // TRANSCRIPTION CODE COMMENTED OUT
    // if (processor) {
    //   processor.disconnect();
    //   processor = null;
    // }
    // if (zeroGain) {
    //   zeroGain.disconnect();
    //   zeroGain = null;
    // }
    analyser = null;
    microphone = null;
  }

  window.BrainAudioCapture = {
    start,
    stop,
  };
})();
