export function base64ToWavUrl(base64: string, sampleRate: number = 24000): string {
  const binaryString = atob(base64);
  const pcmBytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    pcmBytes[i] = binaryString.charCodeAt(i);
  }

  const wavBytes = new Uint8Array(44 + pcmBytes.length);
  const view = new DataView(wavBytes.buffer);

  const writeString = (offset: number, string: string) => {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  };

  writeString(0, "RIFF");
  view.setUint32(4, 36 + pcmBytes.length, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, 1, true); // 1 channel
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // byte rate
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  writeString(36, "data");
  view.setUint32(40, pcmBytes.length, true);

  wavBytes.set(pcmBytes, 44);

  const blob = new Blob([wavBytes], { type: "audio/wav" });
  return URL.createObjectURL(blob);
}

export async function audioFileToBase64Wav(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  // Using an AudioContext to decode
  const baseCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
  const audioBuffer = await baseCtx.decodeAudioData(arrayBuffer);
  
  // Resample to 24000 Hz, 1 channel
  const TARGET_SAMPLE_RATE = 24000;
  const maxDuration = Math.min(audioBuffer.duration, 5);
  const numFrames = Math.max(1, Math.ceil(maxDuration * TARGET_SAMPLE_RATE));
  const offlineCtx = new OfflineAudioContext(1, numFrames, TARGET_SAMPLE_RATE);
  
  const source = offlineCtx.createBufferSource();
  source.buffer = audioBuffer;
  source.connect(offlineCtx.destination);
  source.start(0, 0, maxDuration);

  const resampledBuffer = await offlineCtx.startRendering();
  const channelData = resampledBuffer.getChannelData(0); // Float32Array

  // Convert to 16 bit PCM
  const pcmLength = channelData.length;
  // 44 bytes header + 2 bytes per sample
  const buffer = new ArrayBuffer(44 + pcmLength * 2);
  const view = new DataView(buffer);

  const writeString = (offset: number, string: string) => {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  };

  writeString(0, "RIFF");
  view.setUint32(4, 36 + pcmLength * 2, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true); // fmt chunk size
  view.setUint16(20, 1, true); // format = PCM
  view.setUint16(22, 1, true); // channels = 1
  view.setUint32(24, TARGET_SAMPLE_RATE, true);
  view.setUint32(28, TARGET_SAMPLE_RATE * 2, true); // Byte rate
  view.setUint16(32, 2, true); // Block align
  view.setUint16(34, 16, true); // Bits per sample
  writeString(36, "data");
  view.setUint32(40, pcmLength * 2, true);

  let offset = 44;
  for (let i = 0; i < pcmLength; i++) {
    // scale to 16 bit INT, clamping between -32768 and 32767
    let s = Math.max(-1, Math.min(1, channelData[i]));
    s = s < 0 ? s * 0x8000 : s * 0x7FFF;
    view.setInt16(offset, s, true);
    offset += 2;
  }

  // To Base64
  let binary = "";
  const bytes = new Uint8Array(buffer);
  
  // Split array in cases where size is too large for single spread
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunkSize)));
  }

  return btoa(binary);
}

