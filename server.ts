import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type, ThinkingLevel } from "@google/genai";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  // API routes FIRST
  app.post("/api/verify-password", (req, res) => {
    const { password } = req.body;
    const APP_PASSWORD = process.env.APP_PASSWORD;

    if (!APP_PASSWORD) {
      // If no password is set, we bypass protection
      return res.json({ success: true });
    }

    if (password === APP_PASSWORD) {
      return res.json({ success: true });
    }

    return res.status(401).json({ error: "Invalid password" });
  });

  app.post("/api/generate", async (req, res) => {
    try {
      const { script, sceneCount, password, apiKey: reqApiKey } = req.body;
      
      const APP_PASSWORD = process.env.APP_PASSWORD;
      if (APP_PASSWORD && password !== APP_PASSWORD) {
        return res.status(401).json({ error: "Unauthorized: Invalid password" });
      }

      if (!script) {
        return res.status(400).json({ error: "Script is required" });
      }

      const apiKey = reqApiKey || process.env.GEMINI_API_KEY2;
      if (!apiKey) {
        return res.status(500).json({ error: "Gemini API Key is not configured." });
      }

      const ai = new GoogleGenAI({ 
        apiKey,
        timeout: 300000,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          }
        }
      });

      const countInstruction = sceneCount && sceneCount !== 'auto' 
        ? `You MUST generate EXACTLY ${sceneCount} scenes.` 
        : '';
        
      const startTime = Date.now();
      
      const modelsToTry = textModel && textModel !== 'auto' 
        ? [textModel, "gemma-26b", "a4b", "gemini-3.5-flash"] 
        : ["gemma-4-31b", "gemma-26b", "a4b", "gemini-3.5-flash"];

      // Deduplicate keeping order
      const uniqueModels = [...new Set(modelsToTry)];

      let response: any;
      let lastError: any;

      for (const modelName of uniqueModels) {
        try {
          response = await ai.models.generateContent({
            model: modelName,
            contents: `Analyze the following YouTube script and break it down into a scene-by-scene asset plan.
${countInstruction}
IMPORTANT: Each scene's scriptSnippet MUST contain approximately 10-15 words.

For each scene, provide a title, a snippet of the script, a visual description of what should be on screen, and an array of 2-5 search terms that could be used on Pexels to find relevant stock footage (photos or videos, aim for generic but descriptive 1-4 word phrases).

Script to analyze:
${script}`,
            config: {
              thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
              responseMimeType: "application/json",
              responseSchema: {
                type: Type.ARRAY,
                items: {
                   type: Type.OBJECT,
                   properties: {
                     title: { type: Type.STRING, description: "Title of the scene, e.g., Hook, Introduction" },
                     scriptSnippet: { type: Type.STRING, description: "Relevant portion of the script, 10-15 words approx." },
                     visualDescription: { type: Type.STRING, description: "Visual description of the scene" },
                     searchTerms: {
                       type: Type.ARRAY,
                       items: { type: Type.STRING },
                       description: "List of 1-4 word search terms for stock footage"
                     }
                   },
                   required: ["title", "scriptSnippet", "visualDescription", "searchTerms"]
                }
              }
            }
          });
          break; // success
        } catch (err: any) {
          console.warn(`Model ${modelName} failed:`, err.status, err.message);
          lastError = err;
        }
      }

      if (!response) {
        throw lastError || new Error("All text generation models failed");
      }
      
      const endTime = Date.now();
      const timeMs = endTime - startTime;

      const textResult = response.text;
      if (!textResult) {
        throw new Error("No response string from Gemini");
      }
      const data = JSON.parse(textResult);

      const usage = response.usageMetadata || { promptTokenCount: 0, candidatesTokenCount: 0 };
      const cost = (usage.promptTokenCount * 0.075 / 1000000) + (usage.candidatesTokenCount * 0.30 / 1000000);

      res.json({
        scenes: data,
        stats: {
          inputTokens: usage.promptTokenCount,
          outputTokens: usage.candidatesTokenCount,
          timeMs,
          cost
        }
      });
    } catch (error: any) {
      console.error("Error generating asset plan:", error);
      res.status(500).json({ error: error.message || "Something went wrong" });
    }
  });

  app.post("/api/tts", async (req, res) => {
    try {
      const { text, voiceName, customVoiceAudioBase64, password, apiKey: reqApiKey } = req.body;
      
      const APP_PASSWORD = process.env.APP_PASSWORD;
      if (APP_PASSWORD && password !== APP_PASSWORD) {
        return res.status(401).json({ error: "Unauthorized: Invalid password" });
      }

      if (!text) {
        return res.status(400).json({ error: "Text is required" });
      }
      
      const apiKey = reqApiKey || process.env.GEMINI_API_KEY2;
      if (!apiKey) {
        return res.status(500).json({ error: "Gemini API Key is not configured." });
      }

      const ai = new GoogleGenAI({ 
        apiKey,
        timeout: 300000,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          }
        }
      });

      // If customVoiceAudioBase64 is provided, use replicatedVoiceConfig
      let voiceConfig: any = {};
      if (customVoiceAudioBase64) {
        voiceConfig = {
          replicatedVoiceConfig: {
            mimeType: "audio/wav",
            voiceSampleAudio: customVoiceAudioBase64
          }
        };
      } else {
        voiceConfig = {
          prebuiltVoiceConfig: { voiceName: (voiceName && voiceName !== 'custom') ? voiceName : 'Puck' }
        };
      }

      // Helper to chunk text
      function chunkText(text: string, maxLength: number) {
        let sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
        const chunks: string[] = [];
        let currentChunk = '';
        for (let sentence of sentences) {
          while (sentence.length > maxLength) {
            if (currentChunk.trim()) chunks.push(currentChunk.trim());
            currentChunk = '';
            chunks.push(sentence.substring(0, maxLength).trim());
            sentence = sentence.substring(maxLength);
          }
          if ((currentChunk + sentence).length > maxLength && currentChunk.length > 0) {
            chunks.push(currentChunk.trim());
            currentChunk = '';
          }
          currentChunk += sentence + ' ';
        }
        if (currentChunk.trim()) chunks.push(currentChunk.trim());
        return chunks;
      }

      const textChunks = chunkText(text, 200);

      const generateChunk = async (chunkText: string) => {
        try {
          const response = await ai.models.generateContent({
            model: "gemini-3.1-flash-tts-preview",
            contents: [{ parts: [{ text: chunkText }] }],
            config: {
              responseModalities: ["AUDIO"],
              speechConfig: { voiceConfig },
            },
          });
          return response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
        } catch (err: any) {
          if (customVoiceAudioBase64 && err.message && err.message.includes('INVALID_ARGUMENT')) {
             console.warn("Custom voice cloning failed for a chunk. Falling back to prebuilt voice. Details:", err.status, err.details);
             const fallbackResponse = await ai.models.generateContent({
              model: "gemini-3.1-flash-tts-preview",
              contents: [{ parts: [{ text: chunkText }] }],
              config: {
                responseModalities: ["AUDIO"],
                speechConfig: {
                  voiceConfig: {
                    prebuiltVoiceConfig: { voiceName: (voiceName && voiceName !== 'custom') ? voiceName : 'Puck' }
                  }
                }
              },
            });
            return fallbackResponse.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
          }
          throw err;
        }
      };

      const base64Chunks: string[] = [];
      for (const piece of textChunks) {
        if (!piece) continue;
        const b64 = await generateChunk(piece);
        if (b64) base64Chunks.push(b64);
      }

      if (base64Chunks.length === 0) {
        throw new Error("No audio generated");
      }

      // Concatenate WAV chunks
      const buffers = base64Chunks.map(b64 => Buffer.from(b64, 'base64'));
      let totalPcmLength = 0;
      const pcmChunks: Buffer[] = [];
      
      buffers.forEach((buf, i) => {
        let pcmOffset = 44;
        for (let j = 12; j < buf.length - 4; j++) {
          if (buf[j] === 0x64 && buf[j+1] === 0x61 && buf[j+2] === 0x74 && buf[j+3] === 0x61) { // 'data'
            pcmOffset = j + 8;
            break;
          }
        }
        if (buf.length > pcmOffset) {
          const pcm = buf.subarray(pcmOffset);
          pcmChunks.push(pcm);
          totalPcmLength += pcm.length;
        }
      });

      if (pcmChunks.length === 0) {
        throw new Error("Invalid audio chunks generated");
      }

      // Reconstruct single WAV
      // Find the 'data' chunk offset for the first buffer to get its header length
      let firstHeaderLength = 44;
      for (let j = 12; j < buffers[0].length - 4; j++) {
        if (buffers[0][j] === 0x64 && buffers[0][j+1] === 0x61 && buffers[0][j+2] === 0x74 && buffers[0][j+3] === 0x61) {
          firstHeaderLength = j + 8;
          break;
        }
      }

      const finalHeader = Buffer.alloc(firstHeaderLength);
      buffers[0].copy(finalHeader, 0, 0, firstHeaderLength);
      
      const fileLength = (firstHeaderLength - 8) + totalPcmLength;
      finalHeader.writeUInt32LE(fileLength, 4); // chunk size
      finalHeader.writeUInt32LE(totalPcmLength, firstHeaderLength - 4); // subchunk2 size
      
      const combinedPcm = Buffer.concat(pcmChunks);
      const finalWavBuffer = Buffer.concat([finalHeader, combinedPcm]);
      
      res.json({ audioBase64: finalWavBuffer.toString('base64') });
    } catch (error: any) {
      console.error("Error generating TTS:", error);
      res.status(500).json({ error: error.message || "Something went wrong generating audio" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.get("/api/ping", (req, res) => {
    res.status(200).send("pong");
  });

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);

    // Self-polling mechanism to keep Render free tier awake
    const hostUrl = process.env.RENDER_EXTERNAL_URL || process.env.APP_URL;
    if (hostUrl) {
      console.log(`Starting self-polling mechanism for URL: ${hostUrl}`);
      setInterval(() => {
        const pingUrl = `${hostUrl.replace(/\/$/, '')}/api/ping`;
        fetch(pingUrl)
          .then(res => console.log(`[Self-Ping] ${pingUrl} -> Status: ${res.status}`))
          .catch(err => console.error(`[Self-Ping] Error pinging ${pingUrl}:`, err.message));
      }, 5 * 60 * 1000); // exactly every 5 minutes
    } else {
      console.log('No RENDER_EXTERNAL_URL or APP_URL set, skipping self-polling mechanism.');
    }
  });
}

startServer();
