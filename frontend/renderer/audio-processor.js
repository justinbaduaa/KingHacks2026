/**
 * AudioWorklet processor for capturing PCM audio data.
 * Runs on a separate audio thread to avoid blocking the main thread.
 * 
 * This processor:
 * 1. Receives audio frames from the microphone
 * 2. Buffers them until we have enough samples
 * 3. Converts Float32 to Int16 PCM format (required by AWS Transcribe)
 * 4. Posts the buffer to the main thread via message port
 */
class AudioStreamProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    
    // Buffer to accumulate samples before sending
    // We'll aim for ~256ms chunks at whatever sample rate we're running at
    // At 16kHz: 4096 samples = 256ms
    // At 44.1kHz: 11025 samples = 250ms
    // At 48kHz: 12000 samples = 250ms
    this.buffer = [];
    this.bufferSize = 4096; // Will be adjusted based on sample rate
    this.isActive = true;
    
    // Listen for messages from main thread
    this.port.onmessage = (event) => {
      if (event.data.type === 'stop') {
        this.isActive = false;
      } else if (event.data.type === 'setBufferSize') {
        this.bufferSize = event.data.size;
      }
    };
  }
  
  /**
   * Process audio frames. Called by the audio rendering thread.
   * @param {Array} inputs - Array of inputs, each containing channels
   * @param {Array} outputs - Array of outputs (unused, we're just capturing)
   * @param {Object} parameters - Audio parameters (unused)
   * @returns {boolean} - Return true to keep processor alive
   */
  process(inputs, outputs, parameters) {
    if (!this.isActive) {
      return false; // Stop processing
    }
    
    const input = inputs[0];
    if (!input || !input[0]) {
      return true; // No input, but keep running
    }
    
    // Get mono channel (first channel)
    const channelData = input[0];
    
    // Add samples to buffer
    for (let i = 0; i < channelData.length; i++) {
      this.buffer.push(channelData[i]);
    }
    
    // When buffer is full, send to main thread
    while (this.buffer.length >= this.bufferSize) {
      const chunk = this.buffer.splice(0, this.bufferSize);
      
      // Convert Float32 [-1, 1] to Int16 [-32768, 32767]
      const int16Array = new Int16Array(chunk.length);
      for (let i = 0; i < chunk.length; i++) {
        // Clamp and convert
        const sample = Math.max(-1, Math.min(1, chunk[i]));
        int16Array[i] = Math.floor(sample * 32767);
      }
      
      // Send to main thread
      this.port.postMessage({
        type: 'audio',
        buffer: int16Array.buffer
      }, [int16Array.buffer]); // Transfer ownership for efficiency
    }
    
    return true; // Keep processor running
  }
}

// Register the processor
registerProcessor('audio-stream-processor', AudioStreamProcessor);
