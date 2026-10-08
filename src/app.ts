import { formatDate } from './label/format.js';
import type { Rotacao } from './label/rotate.js';
import type { Bitmap1bpp, DadosRotulo } from './label/types.js';
import { drawBitmap, loadFonts, renderLabel } from './env.js';
import { baixarPng, imprimir } from './print.js';
import { camposFaltando, dadosDoPedido, ordenarCafes, textoNaLista, type Pedido } from './request.js';
import { BrowserRepository, CafeBook, exportBackup, importBackup, type Cafe } from './storage.js';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const repo = new BrowserRepository();
const book = new CafeBook(repo);

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const aviso = (el: HTMLElement, tipo: '' | 'ok' | 'fail', texto: string) => {
  el.className = tipo;
  el.textContent = texto;
};

// ---------- abas
document.querySelectorAll<HTMLButtonElement>('.tab').forEach((b) =>
  b.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t === b));
    document.querySelectorAll('.panel').forEach((p) => p.classList.toggle('active', p.id === b.dataset.tab));
    if (b.dataset.tab === 'emitir') loadCafes();
    if (b.dataset.tab === 'cafes') renderCafes();
    if (b.dataset.tab === 'config') loadConfig();
  }),
);

// ---------- emissão

/** Peso e moagem viram botões de escolha (menos cliques); o <select> continua como fonte do valor. */
function botoesDeEscolha(id: string): void {
  const select = $(id) as HTMLSelectElement;
  const opcoes = [...select.options].filter((o) => o.value);
  const grupo = document.createElement('div');
  grupo.className = 'chips';
  grupo.style.setProperty('--n', String(opcoes.length));
  grupo.setAttribute('role', 'group');
  grupo.setAttribute('aria-labelledby', `lbl-${id}`);
  const marcar = () => grupo.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.valor === select.value)));
  for (const o of opcoes) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip';
    b.dataset.valor = o.value;
    b.textContent = o.textContent;
    b.addEventListener('click', () => {
      select.value = o.value;
      marcar();
      select.dispatchEvent(new Event('input', { bubbles: true }));
    });
    grupo.appendChild(b);
  }
  select.after(grupo);
  select.addEventListener('change', marcar);
  marcar();
}
botoesDeEscolha('peso');
botoesDeEscolha('moagem');

/** Botões − e + do número de cópias. */
function contadorDeCopias(): void {
  const campo = $('copias') as HTMLInputElement;
  const ajustar = (delta: number) => {
    const atual = Number.parseInt(campo.value, 10);
    campo.value = String(Math.min(500, Math.max(1, (Number.isFinite(atual) ? atual : 1) + delta)));
    campo.dispatchEvent(new Event('input', { bubbles: true }));
  };
  $('menos').addEventListener('click', () => ajustar(-1));
  $('mais').addEventListener('click', () => ajustar(1));
}
contadorDeCopias();
const FIELDS: Record<string, string> = { cliente: 'Cliente', cafe: 'Café', peso: 'Peso', moagem: 'Moagem', data: 'Data de torra', copias: 'Número de cópias' };
const val = (id: string) => ($(id) as HTMLInputElement | HTMLSelectElement).value;

function pedido(): Pedido {
  return { cafe: book.get(val('cafe')), cliente: val('cliente'), peso: val('peso'), moagem: val('moagem'), dataTorra: val('data'), copias: Number(val('copias')) };
}

function loadCafes(): void {
  const atual = val('cafe');
  const ativos = ordenarCafes(book.list().filter((c) => c.ativo));
  $('cafe').innerHTML = '<option value="">Escolha…</option>' + ativos.map((c) => `<option value="${esc(c.id)}">${esc(textoNaLista(c, ativos))}</option>`).join('');
  if (ativos.some((c) => c.id === atual)) ($('cafe') as HTMLSelectElement).value = atual;
  else if (ativos.length === 1) ($('cafe') as HTMLSelectElement).value = ativos[0].id;
  refreshPreview();
}

let previewTimer: number | undefined;
let previewSeq = 0;
function refreshPreview(): void {
  clearTimeout(previewTimer);
  previewTimer = window.setTimeout(async () => {
    const seq = ++previewSeq;
    const dados = dadosDoPedido(pedido());
    const canvas = $<HTMLCanvasElement>('previa');
    if (!dados) {
      canvas.hidden = true;
      $('previa-vazia').hidden = false;
      return;
    }
    try {
      const bmp = await renderLabel(dados, { selo: repo.getConfig().selo });
      if (seq !== previewSeq) return;
      drawBitmap(bmp, canvas);
      canvas.hidden = false;
      $('previa-vazia').hidden = true;
    } catch {
      if (seq !== previewSeq) return;
      canvas.hidden = true;
      $('previa-vazia').hidden = false;
      $('previa-vazia').textContent = 'Não foi possível gerar a pré-visualização.';
    }
  }, 120);
}

for (const id of Object.keys(FIELDS)) {
  $(id).addEventListener('input', () => {
    $(id).classList.remove('invalido');
    aviso($('aviso'), '', '');
    refreshPreview();
  });
}

async function emitir(dados: DadosRotulo, copias: number): Promise<string> {
  const cfg = repo.getConfig();
  const bmp: Bitmap1bpp = await renderLabel(dados, { selo: cfg.selo });
  if (cfg.modoSemImpressora) {
    baixarPng(bmp, `rotulo-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.png`);
    return 'Modo sem impressora: o rótulo foi baixado como imagem.';
  }
  const r = await imprimir(bmp, copias, cfg.rotacao);
  return `${copias === 1 ? '1 etiqueta enviada' : `${copias} etiquetas enviadas`} para impressão (${r.largura} × ${r.altura}). Confira na impressora.`;
}

$('form').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  document.querySelectorAll('.invalido').forEach((e) => e.classList.remove('invalido'));
  const p = pedido();
  const faltam: string[] = [];
  if (!p.cliente.trim()) faltam.push('cliente');
  if (!p.cafe) faltam.push('cafe');
  if (!val('peso')) faltam.push('peso');
  if (!val('moagem')) faltam.push('moagem');
  if (!val('data')) faltam.push('data');
  if (camposFaltando(p).some((f) => f.startsWith('Número'))) faltam.push('copias');
  if (faltam.length) {
    faltam.forEach((id) => $(id).classList.add('invalido'));
    aviso($('aviso'), 'fail', `Não imprimi. Falta preencher: ${faltam.map((id) => FIELDS[id]).join(', ')}.`);
    $(faltam[0]).focus();
    return;
  }
  const dados = dadosDoPedido(p)!;
  ($('imprimir') as HTMLButtonElement).disabled = true;
  aviso($('aviso'), '', 'Preparando a impressão…');
  try {
    const msg = await emitir(dados, p.copias);
    aviso($('aviso'), 'ok', '✔ ' + msg);
    // mantém café, peso, moagem e data; limpa só o cliente
    ($('cliente') as HTMLInputElement).value = '';
    refreshPreview();
    $('cliente').focus();
  } catch (e) {
    aviso($('aviso'), 'fail', '✖ ' + (e instanceof Error ? e.message : 'Erro inesperado.'));
  } finally {
    ($('imprimir') as HTMLButtonElement).disabled = false;
  }
});

// ---------- cadastro de cafés
let editId: string | null = null;
function renderCafes(): void {
  const lista = ordenarCafes(book.list());
  $('lista-cafes').innerHTML =
    lista
      .map(
        (c) => `
      <div class="cafe-item ${c.ativo ? '' : 'inativo'}">
        <div class="info"><strong>${esc(textoNaLista(c, lista))}</strong>${c.ativo ? '' : '<span class="tag">Inativo</span>'}
          <small>${esc([c.notas, c.produtor, c.regiao].filter(Boolean).join(' · '))}</small></div>
        <button data-act="edit" data-id="${esc(c.id)}">Editar</button>
        <button data-act="toggle" data-id="${esc(c.id)}">${c.ativo ? 'Desativar' : 'Ativar'}</button>
        <button data-act="del" data-id="${esc(c.id)}" class="danger">Remover</button>
      </div>`,
      )
      .join('') || '<p>Nenhum café cadastrado.</p>';
}
$('lista-cafes').addEventListener('click', (ev) => {
  const b = (ev.target as HTMLElement).closest('button');
  if (!b) return;
  const c = book.get(b.dataset.id ?? '');
  if (!c) return;
  if (b.dataset.act === 'edit') openCafe(c);
  if (b.dataset.act === 'toggle') {
    book.update(c.id, { ...c, ativo: !c.ativo });
    renderCafes();
  }
  if (b.dataset.act === 'del' && confirm(`Remover "${c.nome}" de vez? Para só esconder da lista, use "Desativar".`)) {
    book.remove(c.id);
    renderCafes();
  }
});
const CAMPOS = ['nome', 'notas', 'produtor', 'rotuloProdutor', 'variedade', 'regiao', 'especie', 'torra'] as const;
function openCafe(c: Cafe | null): void {
  editId = c ? c.id : null;
  const f = $('form-cafe') as HTMLFormElement;
  $('dlg-titulo').textContent = c ? 'Editar café' : 'Novo café';
  for (const k of CAMPOS) (f.elements.namedItem(k) as HTMLInputElement).value = c ? (c[k] ?? '') : k === 'especie' ? '100% Arábica' : '';
  (f.elements.namedItem('ativo') as HTMLInputElement).checked = c ? c.ativo : true;
  $('erro-cafe').textContent = '';
  ($('dlg-cafe') as HTMLDialogElement).showModal();
  (f.elements.namedItem('nome') as HTMLInputElement).focus();
}
$('novo-cafe').addEventListener('click', () => openCafe(null));
$('cancelar-cafe').addEventListener('click', () => ($('dlg-cafe') as HTMLDialogElement).close());
$('form-cafe').addEventListener('submit', (ev) => {
  ev.preventDefault();
  const f = $('form-cafe') as HTMLFormElement;
  const body: Record<string, string | boolean> = Object.fromEntries(CAMPOS.map((k) => [k, (f.elements.namedItem(k) as HTMLInputElement).value]));
  body.ativo = (f.elements.namedItem('ativo') as HTMLInputElement).checked;
  try {
    if (editId) book.update(editId, body);
    else book.create(body);
    ($('dlg-cafe') as HTMLDialogElement).close();
    renderCafes();
  } catch (e) {
    $('erro-cafe').textContent = e instanceof Error ? e.message : 'Erro inesperado.';
  }
});

// ---------- configurações
function loadConfig(): void {
  const c = repo.getConfig();
  ($('cfg-rotacao') as HTMLSelectElement).value = String(c.rotacao);
  ($('cfg-selo') as HTMLInputElement).checked = c.selo;
  ($('cfg-offline') as HTMLInputElement).checked = c.modoSemImpressora;
}
const lerConfig = () => ({
  rotacao: Number(val('cfg-rotacao')) as Rotacao,
  selo: ($('cfg-selo') as HTMLInputElement).checked,
  modoSemImpressora: ($('cfg-offline') as HTMLInputElement).checked,
});
$('form-config').addEventListener('submit', (ev) => {
  ev.preventDefault();
  repo.saveConfig(lerConfig());
  aviso($('aviso-config'), 'ok', '✔ Configurações salvas.');
  refreshPreview();
});
$('teste').addEventListener('click', async () => {
  const btn = $('teste') as HTMLButtonElement;
  btn.disabled = true;
  repo.saveConfig(lerConfig()); // o teste usa o que está na tela, mesmo sem salvar antes
  aviso($('aviso-config'), '', 'Preparando a etiqueta de teste…');
  try {
    const cafe = book.list()[0];
    const { id: _i, ativo: _a, ...base } = cafe ?? { id: '', ativo: true, nome: 'Café de teste', notas: 'Chocolate e laranja', produtor: 'Produtor', variedade: 'Variedade', regiao: 'Região', especie: '100% Arábica', torra: 'Torra média' };
    const msg = await emitir({ cafe: base, cliente: 'ETIQUETA DE TESTE', peso: '250g', moagem: 'Grão', dataTorra: formatDate(today()) }, 1);
    aviso($('aviso-config'), 'ok', '✔ ' + msg);
  } catch (e) {
    aviso($('aviso-config'), 'fail', '✖ ' + (e instanceof Error ? e.message : 'Erro inesperado.'));
  } finally {
    btn.disabled = false;
  }
});

// ---------- cópia de segurança
$('backup-baixar').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(exportBackup(repo), null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `torralocal-copia-${today()}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  aviso($('aviso-backup'), 'ok', '✔ Cópia de segurança baixada. Guarde o arquivo em local seguro.');
});
$('backup-restaurar').addEventListener('change', async (ev) => {
  const input = ev.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  try {
    if (!confirm('Restaurar vai substituir os cafés e configurações atuais por os do arquivo. Continuar?')) return;
    importBackup(repo, JSON.parse(await file.text()));
    loadConfig();
    loadCafes();
    aviso($('aviso-backup'), 'ok', '✔ Cópia de segurança restaurada.');
  } catch (e) {
    aviso($('aviso-backup'), 'fail', '✖ ' + (e instanceof Error ? e.message : 'Arquivo inválido.'));
  } finally {
    input.value = '';
  }
});

// ---------- início
($('data') as HTMLInputElement).value = today();
if (!repo.persistent) {
  $('aviso-armazenamento').hidden = false;
} else if (navigator.storage?.persist) {
  navigator.storage.persist().catch(() => undefined); // pede ao navegador para não apagar os dados sozinho
}
loadFonts().then(loadCafes);
