import { GoogleGenAI } from "@google/genai";
import * as dotenv from "dotenv";

dotenv.config();

function generateWav(sampleRate = 24000, duration = 3) {
  const pcmLength = sampleRate * duration;
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
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); 
  view.setUint16(22, 1, true); 
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); 
  view.setUint16(32, 2, true); 
  view.setUint16(34, 16, true); 
  writeString(36, "data");
  view.setUint32(40, pcmLength * 2, true);

  let offset = 44;
  for (let i = 0; i < pcmLength; i++) {
    const s = Math.sin(i * 440 * Math.PI * 2 / sampleRate);
    let val = s < 0 ? s * 0x8000 : s * 0x7FFF;
    view.setInt16(offset, val, true);
    offset += 2;
  }
  return Buffer.from(buffer).toString("base64");
}

const audioData = generateWav();


async function test() {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY2 });
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-tts-preview:generateContent?key=${process.env.GEMINI_API_KEY2}`, {
      method: "POST",
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: "Hello" }] }],
        generationConfig: {
          responseModalities: ["AUDIO"],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: {
                voiceName: "Puck"
              }
            }
          }
        }
      })
    });
    console.log("Status:", res.status);
    console.log("Body:", await res.text());
  } catch (err: any) {
    console.error("SDK Error:", err.message);
  }
}

test();
