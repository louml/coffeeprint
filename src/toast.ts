/** Quanto tempo o aviso fica na tela. */
export const TOAST_MS = 3000;
const SAIDA_MS = 200;

/**
 * Aviso temporário no canto superior direito da tela. Some sozinho depois de `ms` (a saída suave
 * faz parte desse tempo) ou ao ser clicado. Os textos entram como texto puro (nada de HTML).
 */
export function mostrarToast(titulo: string, detalhe = '', ms = TOAST_MS): void {
  const area = document.getElementById('toasts');
  if (!area) return;
  const el = document.createElement('div');
  el.className = 'toast';
  const icone = document.createElement('span');
  icone.className = 'toast-icone';
  icone.setAttribute('aria-hidden', 'true');
  icone.textContent = '✔';
  const corpo = document.createElement('div');
  const t = document.createElement('strong');
  t.textContent = titulo;
  corpo.append(t);
  if (detalhe) {
    const d = document.createElement('small');
    d.textContent = detalhe;
    corpo.append(d);
  }
  el.append(icone, corpo);
  area.append(el);
  const sair = () => {
    el.classList.add('saindo');
    window.setTimeout(() => el.remove(), SAIDA_MS);
  };
  const timer = window.setTimeout(sair, Math.max(0, ms - SAIDA_MS));
  el.addEventListener('click', () => {
    window.clearTimeout(timer);
    el.remove();
  });
}
