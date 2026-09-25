import { appendFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const coreTarget = process.env.SPECOPS_CORE_URL || 'http://127.0.0.1:3101';

// #region agent log
function agentLog(
  location: string,
  message: string,
  data: Record<string, unknown>,
  hypothesisId: string,
): void {
  try {
    appendFileSync(
      '/Users/matteo/Documents/projects/specops/.cursor/debug-7ce33b.log',
      `${JSON.stringify({ sessionId: '7ce33b', runId: 'pre-fix', hypothesisId, location, message, data, timestamp: Date.now() })}\n`,
    );
  } catch {
    /* ignore */
  }
}
// #endregion

export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': {
        target: coreTarget,
        changeOrigin: true,
        configure(proxy) {
          proxy.on('error', (err: Error & { code?: string }, req: { url?: string }) => {
            // #region agent log
            agentLog('vite.config.ts:proxy', 'proxy error', { message: err.message, code: err.code, url: req.url, target: coreTarget }, 'A,B');
            // #endregion
          });
          proxy.on('proxyRes', (proxyRes: { statusCode?: number }, req: { url?: string }) => {
            // #region agent log
            if ((req.url ?? '').includes('/specs')) {
              agentLog('vite.config.ts:proxyRes', 'proxied specs response', { status: proxyRes.statusCode, url: req.url, target: coreTarget }, 'A,C');
            }
            // #endregion
          });
        },
      },
    },
  },
  preview: {
    host: '127.0.0.1',
    port: 4173,
    proxy: {
      '/api': {
        target: coreTarget,
        changeOrigin: true,
      },
    },
  },
});
