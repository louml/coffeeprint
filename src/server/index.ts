import express, { type NextFunction, type Request, type Response } from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LabelService, ValidationError } from '../core/service.js';
import { PrinterError } from '../core/printer/send.js';
import { CafeStore } from '../core/storage/cafes.js';
import { ConfigStore } from '../core/storage/config.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PORT = Number(process.env.PORT ?? 3000);
const HOST = process.env.HOST ?? '127.0.0.1';
const DATA_DIR = process.env.DATA_DIR ?? path.join(ROOT, 'data');
const OUT_DIR = process.env.OUT_DIR ?? path.join(ROOT, 'saida');

export function createApp() {
  const cafes = new CafeStore(DATA_DIR);
  const config = new ConfigStore(DATA_DIR);
  const labels = new LabelService(cafes, config, OUT_DIR);

  const app = express();
  app.use(express.json({ limit: '100kb' }));
  app.use(express.static(path.join(ROOT, 'public')));

  app.get('/api/cafes', (_req, res) => res.json(cafes.list()));
  app.post('/api/cafes', (req, res) => res.status(201).json(cafes.create(req.body)));
  app.put('/api/cafes/:id', (req, res) => {
    const c = cafes.update(req.params.id, req.body);
    c ? res.json(c) : res.status(404).json({ erro: 'Café não encontrado.' });
  });
  app.delete('/api/cafes/:id', (req, res) => {
    cafes.remove(req.params.id) ? res.json({ ok: true }) : res.status(404).json({ erro: 'Café não encontrado.' });
  });

  app.get('/api/config', (_req, res) => res.json(config.get()));
  app.put('/api/config', (req, res) => res.json(config.update(req.body)));

  app.post('/api/label/preview', async (req, res) => {
    const png = await labels.preview(req.body);
    if (!png) return void res.status(204).end();
    res.type('png').set('Cache-Control', 'no-store').send(png);
  });
  app.post('/api/label/print', async (req, res) => res.json({ ok: true, ...(await labels.print(req.body)) }));
  app.post('/api/printer/test', async (req, res) =>
    res.json({ ok: true, ...(await labels.printTest(req.body?.enderecoImpressora)) }),
  );

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof ValidationError) return void res.status(400).json({ ok: false, erro: err.message, campos: err.campos });
    if (err instanceof PrinterError) return void res.status(502).json({ ok: false, erro: err.message });
    const msg = err instanceof Error ? err.message : 'Erro inesperado.';
    console.error(err);
    res.status(err instanceof Error && /Informe o nome/.test(msg) ? 400 : 500).json({ ok: false, erro: msg });
  });
  return app;
}

// Express 5 já encaminha erros de handlers async para o middleware acima.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  createApp().listen(PORT, HOST, () => {
    console.log(`Torra Local - Rótulos rodando em http://localhost:${PORT}`);
    console.log('Deixe esta janela aberta enquanto usa o app. Para encerrar, feche-a.');
  });
}
