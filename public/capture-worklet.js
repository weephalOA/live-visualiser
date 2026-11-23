// Forwards mono input to the main thread in 1024-sample blocks for feature extraction.
class CaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.block = new Float32Array(1024);
    this.n = 0;
  }

  process(inputs) {
    const input = inputs[0];
    if (input && input.length > 0) {
      const channels = input.length;
      const len = input[0].length;
      for (let i = 0; i < len; i++) {
        let v = 0;
        for (let c = 0; c < channels; c++) v += input[c][i];
        this.block[this.n++] = v / channels;
        if (this.n === this.block.length) {
          this.port.postMessage(this.block, [this.block.buffer]);
          this.block = new Float32Array(1024);
          this.n = 0;
        }
      }
    }
    return true;
  }
}

registerProcessor('capture', CaptureProcessor);
