import 'dotenv/config';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import type { PulseAnalysisResponse } from './src/types/drift.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = Number(process.env.PORT || 3000);

const aiClient = process.env.GEMINI_API_KEY
  ? new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    })
  : null;

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  const server = http.createServer(app);

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, now: Date.now() });
  });

  app.get('/api/client-config', (_req, res) => {
    const mapsApiKey =
      process.env.VITE_GOOGLE_MAPS_API_KEY ||
      process.env.GOOGLE_MAPS_API_KEY ||
      process.env.MAPS_API_KEY ||
      '';
    res.json({ mapsApiKey });
  });

  // Server-side Gemini Deep Pulse Analysis (Thinking Mode) over live Firestore stories & whispers
  app.post('/api/pulse/analyze', async (req, res) => {
    if (!aiClient) {
      res.status(503).json({
        error:
          'Local Pulse synthesis is unavailable because GEMINI_API_KEY is not configured in the server environment.',
      });
      return;
    }

    const body = (req.body ?? {}) as Record<string, unknown>;
    const query = typeof body.query === 'string' ? body.query.trim() : '';
    const scopeLabel =
      typeof body.scopeLabel === 'string'
        ? body.scopeLabel.trim().slice(0, 80)
        : 'All neighborhoods';

    if (query.length < 4 || query.length > 500) {
      res.status(400).json({
        error: 'Ask a clear question between 4 and 500 characters.',
      });
      return;
    }

    const rawStories = Array.isArray(body.stories) ? body.stories.slice(0, 40) : [];
    const rawWhispers = Array.isArray(body.whispers) ? body.whispers.slice(0, 50) : [];

    const contextPayload = {
      scope: scopeLabel,
      activeStories: rawStories,
      activeWhispers: rawWhispers,
    };

    try {
      const response = await aiClient.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: `Analyze these live anonymous neighborhood stories and ephemeral messages from real users and answer the question thoroughly.\n\nUser Question: ${query}\n\nLive Neighborhood Data:\n${JSON.stringify(contextPayload, null, 2)}`,
        config: {
          systemInstruction:
            'You are the Local Pulse analyst for Drift, an anonymous hyperlocal stories and ephemeral chat app. Cross-reference active stories and non-private whispers to spot emerging patterns, verify signal vs noise, and answer complex local questions concisely and helpfully. If no stories or whispers are active yet, state that clearly and honestly.',
          thinkingConfig: {
            thinkingLevel: ThinkingLevel.HIGH,
          },
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              answer: {
                type: Type.STRING,
                description:
                  'A cohesive, grounded synthesis answering the user query in 2-4 crisp sentences.',
              },
              highlights: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    title: { type: Type.STRING },
                    summary: { type: Type.STRING },
                    relatedStoryId: { type: Type.STRING },
                  },
                  required: ['title', 'summary'],
                },
                description: '0 to 4 concrete takeaways grounded in the active stories.',
              },
              confidenceNote: {
                type: Type.STRING,
                description:
                  'Short note about corroboration level and freshness of local reports.',
              },
            },
            required: ['answer', 'highlights', 'confidenceNote'],
          },
        },
      });

      const rawText = (response.text ?? '').trim();
      const parsed = JSON.parse(rawText) as Omit<
        PulseAnalysisResponse,
        'analyzedStoriesCount' | 'analyzedMessagesCount'
      >;

      res.json({
        ...parsed,
        analyzedStoriesCount: rawStories.length,
        analyzedMessagesCount: rawWhispers.length,
      } satisfies PulseAnalysisResponse);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to analyze local pulse.';
      res.status(502).json({ error: message });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Drift server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start Drift server:', err);
  process.exit(1);
});
