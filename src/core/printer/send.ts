import net from 'node:net';

export class PrinterError extends Error {}

export interface PrinterAddress {
  host: string;
  port: number;
}

/** Aceita "192.168.0.50" ou "192.168.0.50:9100". A porta padrão de impressoras de rede é 9100. */
export function parseAddress(raw: string): PrinterAddress {
  const text = (raw ?? '').trim();
  if (!text) throw new PrinterError('O endereço da impressora não foi configurado. Abra "Configurações" e informe o endereço (IP) da impressora.');
  const m = /^([A-Za-z0-9._-]+)(?::(\d{1,5}))?$/.exec(text);
  const port = m?.[2] ? Number(m[2]) : 9100;
  if (!m || port < 1 || port > 65535) {
    throw new PrinterError(`O endereço "${text}" não parece válido. Use algo como 192.168.0.50.`);
  }
  return { host: m[1], port };
}

function friendly(err: NodeJS.ErrnoException, addr: PrinterAddress): string {
  const where = `${addr.host}:${addr.port}`;
  switch (err.code) {
    case 'ECONNREFUSED':
      return `A impressora em ${where} recusou a conexão. Confira se está ligada e se o endereço está correto.`;
    case 'ETIMEDOUT':
    case 'EHOSTUNREACH':
    case 'ENETUNREACH':
      return `Não consegui encontrar a impressora em ${where}. Confira se ela está ligada e conectada à rede.`;
    case 'ENOTFOUND':
    case 'EAI_AGAIN':
      return `O endereço "${addr.host}" não foi encontrado na rede. Confira o endereço em Configurações.`;
    case 'ECONNRESET':
    case 'EPIPE':
      return `A conexão com a impressora em ${where} foi interrompida. Tente novamente.`;
    default:
      return `Não foi possível enviar para a impressora em ${where} (${err.code ?? err.message}).`;
  }
}

/** Envia dados brutos para a impressora via TCP. Resolve quando tudo foi entregue à conexão. */
export function sendRaw(addr: PrinterAddress, payload: string | Buffer, timeoutMs = 5000): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const socket = net.createConnection({ host: addr.host, port: addr.port });
    const done = (err?: Error) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      err ? reject(err) : resolve();
    };
    socket.setTimeout(timeoutMs);
    socket.once('timeout', () => done(new PrinterError(`A impressora em ${addr.host}:${addr.port} não respondeu a tempo. Confira se está ligada e conectada à rede.`)));
    socket.once('error', (e: NodeJS.ErrnoException) => done(new PrinterError(friendly(e, addr))));
    socket.once('connect', () => {
      socket.end(payload, () => setTimeout(() => done(), 150));
    });
  });
}
