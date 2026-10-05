import net from 'node:net';
import os from 'node:os';

/** Endereços de uma rede /24 para cada interface IPv4 do computador (ex.: 192.168.15.1 a 192.168.15.254). */
export function localCandidates(): string[] {
  const own = new Set<string>();
  const out = new Set<string>();
  for (const list of Object.values(os.networkInterfaces())) {
    for (const i of list ?? []) {
      if (i.family !== 'IPv4' || i.internal) continue;
      own.add(i.address);
      const prefix = i.address.split('.').slice(0, 3).join('.');
      for (let n = 1; n <= 254; n++) out.add(`${prefix}.${n}`);
    }
  }
  return [...out].filter((ip) => !own.has(ip));
}

function probe(host: string, port: number, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    const s = net.createConnection({ host, port });
    const finish = (ok: boolean) => { s.destroy(); resolve(ok); };
    s.setTimeout(timeoutMs, () => finish(false));
    s.once('connect', () => finish(true));
    s.once('error', () => finish(false));
  });
}

/** Procura equipamentos com a porta de impressão (9100) aberta na rede local. */
export async function discoverPrinters(opts: { hosts?: string[]; port?: number; timeoutMs?: number } = {}): Promise<string[]> {
  const hosts = opts.hosts ?? localCandidates();
  const port = opts.port ?? 9100;
  const timeoutMs = opts.timeoutMs ?? 600;
  const found: string[] = [];
  let next = 0;
  const worker = async () => {
    while (next < hosts.length) {
      const host = hosts[next++];
      if (await probe(host, port, timeoutMs)) found.push(host);
    }
  };
  await Promise.all(Array.from({ length: 64 }, worker));
  return found.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}
