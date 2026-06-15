import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type, ThinkingLevel } from "@google/genai";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

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
      const { script, sceneCount, password } = req.body;
      
      const APP_PASSWORD = process.env.APP_PASSWORD;
      if (APP_PASSWORD && password !== APP_PASSWORD) {
        return res.status(401).json({ error: "Unauthorized: Invalid password" });
      }

      if (!script) {
        return res.status(400).json({ error: "Script is required" });
      }

      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return res.status(500).json({ error: "Gemini API Key is not configured." });
      }

      const ai = new GoogleGenAI({ 
        apiKey,
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
      const response = await ai.models.generateContent({
        model: "gemini-3.1-flash-lite",
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
