import { Blob as GoogleGenAIBlob } from '@google/genai';

/**
 * The structure of a blob object expected by the Google Gemini API.
 */

/**
 * Encodes a Uint8Array into a base64 string.
 * @param {Uint8Array} bytes The byte array to encode.
 * @returns {string} The base64 encoded string.
 */
export function encode(bytes: Uint8Array): string {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Decodes a base64 string into a Uint8Array.
 * @param {string} base64 The base64 string to decode.
 * @returns {Uint8Array} The decoded byte array.
 */
export function decode(base64: string): Uint8Array {
    const binaryString = atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
}
  
/**
 * Decodes raw PCM audio data into an AudioBuffer.
 * @param {Uint8Array} data The raw PCM data.
 * @param {AudioContext} ctx The audio context to use for decoding.
 * @param {number} sampleRate The sample rate of the audio.
 * @param {number} numChannels The number of audio channels.
 * @returns {Promise<AudioBuffer>} A promise that resolves with the decoded AudioBuffer.
 */
export async function decodeAudioData(
    data: Uint8Array,
    ctx: AudioContext,
    sampleRate: number,
    numChannels: number,
): Promise<AudioBuffer> {
    const dataInt16 = new Int16Array(data.buffer);
    const frameCount = dataInt16.length / numChannels;
    const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);
  
    for (let channel = 0; channel < numChannels; channel++) {
      const channelData = buffer.getChannelData(channel);
      for (let i = 0; i < frameCount; i++) {
        channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
      }
    }
    return buffer;
}

/**
 * Creates a Gemini API-compatible Blob from raw audio data.
 * @param {Float32Array} data The raw PCM audio data.
 * @returns {GoogleGenAIBlob} The created Blob object.
 */
export function createBlob(data: Float32Array): GoogleGenAIBlob {
  const l = data.length;
  const int16 = new Int16Array(l);
  for (let i = 0; i < l; i++) {
    // FIX: Clamp the sample to the range [-1, 1] to prevent overflow.
    const s = Math.max(-1, Math.min(1, data[i]));
    int16[i] = s < 0 ? s * 32768 : s * 32767;
  }
  return {
    data: encode(new Uint8Array(int16.buffer)),
    mimeType: 'audio/pcm;rate=16000',
  };
}

/**
 * Reads a File object and converts it to a base64 encoded string.
 * @param {File} file The file to convert.
 * @returns {Promise<string>} A promise that resolves with the base64 string.
 */
export function fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const result = reader.result as string;
        // Strip the "data:audio/..." prefix
        const base64Data = result.split(',')[1];
        resolve(base64Data);
      };
      reader.onerror = (error) => reject(error);
    });
}

function writeString(view: DataView, offset: number, string: string) {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
}
  
function floatTo16BitPCM(output: DataView, offset: number, input: Float32Array) {
    for (let i = 0; i < input.length; i++, offset += 2) {
      const s = Math.max(-1, Math.min(1, input[i]));
      output.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    }
}

/**
 * Encodes raw PCM audio samples into a WAV file Blob.
 * @param {Float32Array} samples The raw PCM audio samples.
 * @param {number} sampleRate The sample rate of the audio.
 * @returns {Blob} A Blob object representing the WAV file.
 */
export function encodeWav(samples: Float32Array, sampleRate: number): Blob {
    const buffer = new ArrayBuffer(44 + samples.length * 2);
    const view = new DataView(buffer);
  
    const numChannels = 1;
    const bitsPerSample = 16;
    
    // RIFF header
    writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + samples.length * 2, true);
    writeString(view, 8, 'WAVE');
  
    // "fmt " sub-chunk
    writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true); // Sub-chunk size
    view.setUint16(20, 1, true); // Audio format (1=PCM)
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * numChannels * (bitsPerSample / 8), true); // Byte rate
    view.setUint16(32, numChannels * (bitsPerSample / 8), true); // Block align
    view.setUint16(34, bitsPerSample, true);
    
    // "data" sub-chunk
    writeString(view, 36, 'data');
    view.setUint32(40, samples.length * 2, true);
    
    // Write PCM samples
    floatTo16BitPCM(view, 44, samples);
    
    return new Blob([view], { type: 'audio/wav' });
}