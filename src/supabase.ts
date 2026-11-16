import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_KEY, SUPABASE_URL } from './config.js';

/** Guarda a sessão no navegador; se o armazenamento estiver bloqueado, só dura até fechar a página. */
function armazenamento() {
  const memoria = new Map<string, string>();
  return {
    getItem(k: string): string | null {
      try {
        return window.localStorage.getItem(k) ?? memoria.get(k) ?? null;
      } catch {
        return memoria.get(k) ?? null;
      }
    },
    setItem(k: string, v: string): void {
      memoria.set(k, v);
      try {
        window.localStorage.setItem(k, v);
      } catch {
        /* sem armazenamento: fica só em memória */
      }
    },
    removeItem(k: string): void {
      memoria.delete(k);
      try {
        window.localStorage.removeItem(k);
      } catch {
        /* nada a fazer */
      }
    },
  };
}

const guardado = armazenamento();
let client: SupabaseClient | undefined;
export function supabase(): SupabaseClient {
  client ??= createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storage: guardado },
  });
  return client;
}

/** Espera uma promessa por, no máximo, `ms`; passado o tempo devolve `ao_expirar` (sem internet, o cliente do banco fica tentando de novo). */
export function comTempo<T, U>(promessa: Promise<T>, ms: number, aoExpirar: U): Promise<T | U> {
  return Promise.race([promessa, new Promise<U>((resolve) => setTimeout(() => resolve(aoExpirar), ms))]);
}

function mensagemDeLogin(msg: string): string {
  if (/invalid login credentials/i.test(msg)) return 'E-mail ou senha incorretos.';
  if (/failed to fetch|network|load failed/i.test(msg)) return 'Sem conexão com a internet. Tente de novo.';
  if (/email not confirmed/i.test(msg)) return 'Este e-mail ainda não foi confirmado no Supabase.';
  return msg;
}

/** Há uma sessão? Sem internet a verificação demora; nesse caso vale a sessão guardada neste navegador (o banco recusa se ela não servir mais). */
export async function sessaoAtiva(): Promise<boolean> {
  try {
    const lida = await comTempo(supabase().auth.getSession().then((r) => !!r.data.session), 3000, null);
    if (lida !== null) return lida;
  } catch {
    /* cai no que está guardado */
  }
  return !!guardado.getItem(`sb-${new URL(SUPABASE_URL).hostname.split('.')[0]}-auth-token`);
}

export async function entrar(email: string, senha: string): Promise<void> {
  try {
    const { error } = await supabase().auth.signInWithPassword({ email: email.trim(), password: senha });
    if (error) throw new Error(mensagemDeLogin(error.message));
  } catch (e) {
    if (e instanceof Error && !/^(E-mail|Sem conexão|Este e-mail)/.test(e.message)) throw new Error(mensagemDeLogin(e.message));
    throw e;
  }
}

export async function sair(): Promise<void> {
  await supabase().auth.signOut();
}

/** Avisa quando a sessão termina (sair, ou sessão expirada). */
export function aoTerminarSessao(cb: () => void): void {
  supabase().auth.onAuthStateChange((evento) => {
    if (evento === 'SIGNED_OUT') cb();
  });
}
