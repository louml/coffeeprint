import { formatDate } from './label/format.js';
import type { Rotacao } from './label/rotate.js';
import type { Bitmap1bpp, DadosRotulo } from './label/types.js';
import { moagemNoRotulo } from './label/draw.js';
import { drawBitmap, loadFonts, renderLabel } from './env.js';
import { FilaDeImpressao, dadosDoItem, totalEtiquetas } from './fila.js';
import { baixarPng, imprimir, imprimirLotes } from './print.js';
import { mostrarToast } from './toast.js';
import { camposFaltando, dadosDoPedido, ordenarCafes, textoNaLista, type Pedido } from './request.js';
import { BrowserCafeRepository, BrowserRepository, CafeBook, exportBackup, importBackup, type Cafe } from './storage.js';
import { SupabaseCafeRepository } from './supabase-cafes.js';
import { SupabaseTorraRepository } from './supabase-torras.js';
import { erroDaTorra, parseKg } from './torras.js';
import { aoTerminarSessao, comTempo, entrar, sair, sessaoAtiva, supabase } from './supabase.js';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const repo = new BrowserRepository(); // configurações da impressora e fila: ficam neste computador
const cafesLocais = new BrowserCafeRepository(repo); // cafés que este navegador tinha antes do banco (só para enviar ao banco)
const cafeRepo = new SupabaseCafeRepository(supabase()); // cafés no banco de dados (Supabase)
const book = new CafeBook(cafeRepo);
const torras = new SupabaseTorraRepository(supabase());
const fila = new FilaDeImpressao(repo);

/** Cafés carregados: a tela lê daqui (síncrono) e só as gravações vão ao repositório (assíncrono). */
let cafes: Cafe[] = [];
const cafePorId = (id: string) => cafes.find((c) => c.id === id);

const kgTexto = (kg: number) => `${kg.toLocaleString('pt-BR', { maximumFractionDigits: 3 })} kg`;
const dataBR = (iso: string) => iso.split('-').reverse().join('/');
async function recarregarCafes(): Promise<void> {
  try {
    const lista = await comTempo(book.list(), 6000, null);
    if (!lista) throw new Error('O banco demorou para responder.');
    cafes = lista;
    repo.salvarCacheCafes(cafes);
    aviso($('aviso-dados'), '', '');
  } catch (e) {
    // sem internet: usa a última lista salva (só para consulta e impressão de etiquetas)
    const cache = repo.lerCacheCafes();
    if (!cache) throw e;
    cafes = cache.cafes;
    aviso($('aviso-dados'), 'fail', `Sem conexão com o banco: mostrando a lista de cafés salva em ${new Date(cache.em).toLocaleString('pt-BR')}. Cadastros ficam indisponíveis até a conexão voltar.`);
  }
}

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const aviso = (el: HTMLElement, tipo: '' | 'ok' | 'fail', texto: string) => {
  el.className = tipo;
  el.textContent = texto;
};

/** Falha ao ler ou gravar os dados (com o banco na nuvem, por exemplo, falta de internet). */
function erroDeDados(e: unknown): void {
  aviso($('aviso'), 'fail', '✖ Não foi possível carregar os dados: ' + (e instanceof Error ? e.message : 'erro inesperado.'));
}

// ---------- abas
document.querySelectorAll<HTMLButtonElement>('.tab').forEach((b) =>
  b.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach((t) => {
      t.classList.toggle('active', t === b);
      t.setAttribute('aria-selected', String(t === b));
    });
    document.querySelectorAll('.panel').forEach((p) => p.classList.toggle('active', p.id === b.dataset.tab));
    if (b.dataset.tab === 'emitir') loadCafes().catch(erroDeDados);
    if (b.dataset.tab === 'cafes') renderCafes().catch(erroDeDados);
    if (b.dataset.tab === 'torra') renderTorras().catch(erroDeDados);
    if (b.dataset.tab === 'estoque') renderEstoque();
    if (b.dataset.tab === 'config') loadConfig();
  }),
);

// ---------- emissão

/** Peso e moagem viram botões de escolha (menos cliques); o <select> continua como fonte do valor. */
function botoesDeEscolha(id: string, opcional = false): void {
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
      select.value = opcional && select.value === o.value ? '' : o.value; // campo opcional: clicar de novo desmarca
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
botoesDeEscolha('entrega', true);

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
const FIELDS: Record<string, string> = { cliente: 'Cliente', cafe: 'Café', peso: 'Peso', moagem: 'Moagem', entrega: 'Entrega', data: 'Data de torra', copias: 'Número de cópias' };
const val = (id: string) => ($(id) as HTMLInputElement | HTMLSelectElement).value;

function pedido(): Pedido {
  return { cafe: cafePorId(val('cafe')), cliente: val('cliente'), peso: val('peso'), moagem: val('moagem'), entrega: val('entrega'), dataTorra: val('data'), copias: Number(val('copias')) };
}

async function loadCafes(): Promise<void> {
  await recarregarCafes();
  const atual = val('cafe');
  const ativos = ordenarCafes(cafes.filter((c) => c.ativo));
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
  const r = await imprimir(bmp, copias, cfg.rotacao, cfg.ajusteVertical);
  return `${copias === 1 ? '1 etiqueta enviada' : `${copias} etiquetas enviadas`} para impressão (${r.largura} × ${r.altura}). Confira na impressora.`;
}

/** Confere os campos obrigatórios. Se faltar algo, destaca os campos, avisa e devolve null. */
function lerFormulario(acao: 'imprimi' | 'adicionei'): Pedido | null {
  document.querySelectorAll('.invalido').forEach((e) => e.classList.remove('invalido'));
  const p = pedido();
  const faltam: string[] = [];
  if (!p.cliente.trim()) faltam.push('cliente');
  if (!p.cafe) faltam.push('cafe');
  if (!val('peso')) faltam.push('peso');
  if (!val('moagem')) faltam.push('moagem');
  if (!p.dataTorra) faltam.push('data');
  if (camposFaltando(p).some((f) => f.startsWith('Número'))) faltam.push('copias');
  if (faltam.length) {
    faltam.forEach((id) => $(id).classList.add('invalido'));
    aviso($('aviso'), 'fail', `Não ${acao}. Falta preencher: ${faltam.map((id) => FIELDS[id]).join(', ')}.`);
    $(faltam[0]).focus();
    return null;
  }
  return p;
}

/**
 * Depois de imprimir: mantém café, peso, moagem e data; limpa o cliente e a entrega (variam a cada pedido).
 * Depois de adicionar à fila (`manterCliente`): mantém também o cliente e a entrega, para montar vários itens do mesmo pedido.
 */
function prepararProximo(manterCliente = false): void {
  if (!manterCliente) {
    ($('cliente') as HTMLInputElement).value = '';
    ($('entrega') as HTMLSelectElement).value = '';
    $('entrega').dispatchEvent(new Event('change')); // atualiza os botões de escolha
  }
  refreshPreview();
  $('cliente').focus();
}

$('form').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const p = lerFormulario('imprimi');
  if (!p) return;
  const dados = dadosDoPedido(p)!;
  ($('imprimir') as HTMLButtonElement).disabled = true;
  aviso($('aviso'), '', 'Preparando a impressão…');
  try {
    const msg = await emitir(dados, p.copias);
    aviso($('aviso'), 'ok', '✔ ' + msg);
    prepararProximo();
  } catch (e) {
    aviso($('aviso'), 'fail', '✖ ' + (e instanceof Error ? e.message : 'Erro inesperado.'));
  } finally {
    ($('imprimir') as HTMLButtonElement).disabled = false;
  }
});

// ---------- fila de impressão
const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

$('adicionar').addEventListener('click', () => {
  const p = lerFormulario('adicionei');
  if (!p) return;
  try {
    fila.adicionar(p);
  } catch (e) {
    aviso($('aviso'), 'fail', '✖ ' + (e instanceof Error ? e.message : 'Erro inesperado.'));
    return;
  }
  const itens = fila.list();
  aviso($('aviso'), '', ''); // limpa qualquer aviso anterior; o sucesso aparece como aviso temporário
  mostrarToast('Adicionado à fila', `${plural(p.copias, 'etiqueta', 'etiquetas')} de "${p.cliente.trim()}" · Na fila: ${plural(fila.total(), 'etiqueta', 'etiquetas')} (${plural(itens.length, 'item', 'itens')})`);
  renderFila();
  prepararProximo(true);
});

/** Como o item aparece na lista flutuante: cliente em cima; café / quantidade / moagem embaixo. */
function renderFila(): void {
  const itens = fila.list();
  $('fila-flutuante').hidden = itens.length === 0;
  if (!itens.length) {
    fecharFila();
    return;
  }
  const todos = cafes;
  const pendentes = itens.filter((i) => !i.enviado);
  const aImprimir = pendentes.length ? totalEtiquetas(pendentes) : totalEtiquetas(itens);
  $('fila-badge').textContent = String(totalEtiquetas(itens));
  $('fila-fab').setAttribute('aria-label', `Fila de impressão: ${plural(totalEtiquetas(itens), 'etiqueta', 'etiquetas')}`);
  $('fila-resumo').textContent = `${plural(totalEtiquetas(itens), 'etiqueta', 'etiquetas')} · ${plural(itens.length, 'item', 'itens')}`;
  $('fila-lista').innerHTML = itens
    .map((i) => {
      const nome = textoNaLista({ id: i.cafeId, nome: i.cafe.nome, torra: i.cafe.torra }, todos);
      return `<li class="fila-item ${i.enviado ? 'enviado' : ''}" data-id="${esc(i.id)}">
        <div class="fila-info">
          <strong>${esc(i.cliente)}${i.enviado ? ' <span class="tag enviado">✔ Enviado</span>' : ''}</strong>
          <small>${esc(nome)} / ${i.copias} / ${esc(moagemNoRotulo(i.moagem))}</small>
        </div>
        <button type="button" class="fila-btn" data-act="editar" aria-label="Editar ${esc(i.cliente)}" title="Editar">✎</button>
        <button type="button" class="fila-btn danger" data-act="remover" aria-label="Remover ${esc(i.cliente)} da fila" title="Remover">✕</button>
      </li>`;
    })
    .join('');
  $('fila-imprimir-texto').textContent = pendentes.length ? 'Imprimir fila' : 'Imprimir de novo';
  $('fila-contagem').textContent = plural(aImprimir, 'etiqueta', 'etiquetas');
}

function abrirFila(abrir: boolean): void {
  $('fila-card').hidden = !abrir;
  $('fila-fab').setAttribute('aria-expanded', String(abrir));
}
const fecharFila = () => abrirFila(false);
$('fila-fab').addEventListener('click', () => abrirFila($('fila-card').hidden === true));
document.addEventListener('click', (ev) => {
  if ($('fila-card').hidden !== true && !(ev.target as HTMLElement).closest('#fila-flutuante')) fecharFila();
});
document.addEventListener('keydown', (ev) => {
  if (ev.key === 'Escape' && $('fila-card').hidden !== true) {
    fecharFila();
    $('fila-fab').focus();
  }
});

$('fila-lista').addEventListener('click', (ev) => {
  const b = (ev.target as HTMLElement).closest('button');
  const li = (ev.target as HTMLElement).closest('li');
  if (!b || !li) return;
  const id = li.dataset.id ?? '';
  if (!fila.list().some((i) => i.id === id)) return;
  aviso($('aviso-fila'), '', '');
  if (b.dataset.act === 'remover') {
    fila.remover(id);
    renderFila();
  } else if (b.dataset.act === 'editar') {
    fecharFila();
    editarItem(id);
  }
});

/** Devolve o item ao formulário (e o tira da fila) para corrigir; depois é só adicionar de novo. */
/** Nomes de moagem de versões anteriores, para editar itens que já estavam na fila. */
const MOAGEM_ANTIGA: Record<string, string> = { Moído: 'Coado', 'Moído p/ coado': 'Coado', 'Prensa francesa': 'P. Francesa' };

function editarItem(id: string): void {
  const item = fila.remover(id);
  if (!item) return;
  const cafeSelect = $('cafe') as HTMLSelectElement;
  const existe = [...cafeSelect.options].some((o) => o.value === item.cafeId);
  cafeSelect.value = existe ? item.cafeId : '';
  for (const [campo, valor] of [['peso', item.peso], ['moagem', MOAGEM_ANTIGA[item.moagem] ?? item.moagem], ['entrega', item.entrega ?? '']] as const) {
    ($(campo) as HTMLSelectElement).value = valor;
    $(campo).dispatchEvent(new Event('change')); // atualiza os botões de escolha
  }
  ($('cliente') as HTMLInputElement).value = item.cliente;
  ($('data') as HTMLInputElement).value = item.dataTorra;
  ($('copias') as HTMLInputElement).value = String(item.copias);
  document.querySelectorAll('.invalido').forEach((e) => e.classList.remove('invalido'));
  refreshPreview();
  renderFila();
  aviso($('aviso'), existe ? 'ok' : 'fail', existe ? '✔ Item levado para o formulário. Corrija e clique em "Adicionar à fila" de novo.' : `Item levado para o formulário, mas o café "${item.cafe.nome}" não está mais ativo. Escolha um café para continuar.`);
  $('cliente').focus();
}

$('fila-limpar').addEventListener('click', () => {
  const itens = fila.list();
  if (itens.some((i) => !i.enviado) && !confirm(`Remover ${plural(itens.length, 'item', 'itens')} da fila? Eles ainda não foram impressos.`)) return;
  fila.limpar();
  aviso($('aviso-fila'), '', '');
  renderFila();
});

$('fila-imprimir').addEventListener('click', async () => {
  const itens = fila.list();
  if (!itens.length) return;
  const btn = $('fila-imprimir') as HTMLButtonElement;
  btn.disabled = true;
  const aviso2 = $('aviso-fila');
  try {
    const cfg = repo.getConfig();
    const lotes = [];
    for (let k = 0; k < itens.length; k++) {
      aviso(aviso2, '', `Preparando o rótulo ${k + 1} de ${itens.length}…`);
      await new Promise((r) => setTimeout(r, 0)); // deixa a tela atualizar entre um rótulo e outro
      lotes.push({ bmp: await renderLabel(dadosDoItem(itens[k]), { selo: cfg.selo }), copias: itens[k].copias });
    }
    let msg: string;
    if (cfg.modoSemImpressora) {
      const carimbo = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      lotes.forEach((l, k) => baixarPng(l.bmp, `rotulo-fila-${carimbo}-${String(k + 1).padStart(2, '0')}.png`));
      msg = `Modo sem impressora: ${plural(lotes.length, 'rótulo foi baixado', 'rótulos foram baixados')} como imagem.`;
    } else {
      const r = await imprimirLotes(lotes, cfg.rotacao, cfg.ajusteVertical);
      msg = `${plural(r.copias, 'etiqueta enviada', 'etiquetas enviadas')} para impressão (${r.largura} × ${r.altura}), de ${plural(itens.length, 'item', 'itens')}. Confira na impressora.`;
    }
    fila.marcarEnviadas();
    renderFila();
    aviso(aviso2, 'ok', `✔ ${msg} Os itens ficam marcados como enviados; use "Limpar fila" quando terminar.`);
  } catch (e) {
    aviso(aviso2, 'fail', '✖ ' + (e instanceof Error ? e.message : 'Erro inesperado.'));
  } finally {
    btn.disabled = false;
  }
});

// ---------- cadastro de cafés
let editId: string | null = null;
async function renderCafes(): Promise<void> {
  await recarregarCafes();
  const lista = ordenarCafes(cafes);
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
$('lista-cafes').addEventListener('click', async (ev) => {
  const b = (ev.target as HTMLElement).closest('button');
  if (!b) return;
  const c = cafePorId(b.dataset.id ?? '');
  if (!c) return;
  try {
    if (b.dataset.act === 'edit') openCafe(c);
    if (b.dataset.act === 'toggle') {
      await book.update(c.id, { ...c, ativo: !c.ativo });
      await renderCafes();
    }
    if (b.dataset.act === 'del' && confirm(`Remover "${c.nome}" de vez? Para só esconder da lista, use "Desativar".`)) {
      await book.remove(c.id);
      await renderCafes();
    }
  } catch (e) {
    alert(e instanceof Error ? e.message : 'Erro inesperado.');
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
$('form-cafe').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const f = $('form-cafe') as HTMLFormElement;
  const body: Record<string, string | boolean> = Object.fromEntries(CAMPOS.map((k) => [k, (f.elements.namedItem(k) as HTMLInputElement).value]));
  body.ativo = (f.elements.namedItem('ativo') as HTMLInputElement).checked;
  try {
    if (editId) await book.update(editId, body);
    else await book.create(body);
    ($('dlg-cafe') as HTMLDialogElement).close();
    await renderCafes();
  } catch (e) {
    $('erro-cafe').textContent = e instanceof Error ? e.message : 'Erro inesperado.';
  }
});

// ---------- configurações
function loadConfig(): void {
  const c = repo.getConfig();
  ($('cfg-rotacao') as HTMLSelectElement).value = String(c.rotacao);
  ($('cfg-ajuste') as HTMLInputElement).value = String(c.ajusteVertical);
  ($('cfg-selo') as HTMLInputElement).checked = c.selo;
  ($('cfg-offline') as HTMLInputElement).checked = c.modoSemImpressora;
}
const lerConfig = () => ({
  rotacao: Number(val('cfg-rotacao')) as Rotacao,
  ajusteVertical: Math.max(-10, Math.min(10, Number.parseFloat(val('cfg-ajuste').replace(',', '.')) || 0)),
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
    const cafe = cafes[0];
    const { id: _i, ativo: _a, ...base } = cafe ?? { id: '', ativo: true, nome: 'Café de teste', notas: 'Chocolate e laranja', produtor: 'Produtor', variedade: 'Variedade', regiao: 'Região', especie: '100% Arábica', torra: 'Torra média' };
    const msg = await emitir({ cafe: base, cliente: 'ETIQUETA DE TESTE', peso: '250g', moagem: 'Grão', entrega: '', dataTorra: formatDate(today()) }, 1);
    aviso($('aviso-config'), 'ok', '✔ ' + msg);
  } catch (e) {
    aviso($('aviso-config'), 'fail', '✖ ' + (e instanceof Error ? e.message : 'Erro inesperado.'));
  } finally {
    btn.disabled = false;
  }
});

// ---------- controle de torra
async function renderTorras(): Promise<void> {
  await recarregarCafes();
  const lista = await torras.listar();
  const nomeDoCafe = (id: string) => {
    const c = cafePorId(id);
    return c ? textoNaLista(c, cafes) : 'Café removido';
  };
  $('lista-torras').innerHTML =
    lista
      .map((t, i) => {
        const total = Math.round(t.itens.reduce((s, it) => s + it.quantidadeKg, 0) * 1000) / 1000;
        return `<details class="acordeao"${i === 0 ? ' open' : ''}>
          <summary>
            <span class="acordeao-data">${esc(dataBR(t.dataTorra))}</span>
            <span class="acordeao-quem">${esc(t.torrador)}</span>
            <span class="acordeao-total">${esc(plural(t.itens.length, 'café', 'cafés'))} · ${esc(kgTexto(total))}</span>
          </summary>
          <ul class="acordeao-itens">${t.itens.map((it) => `<li><span>${esc(nomeDoCafe(it.cafeId))}</span><strong>${esc(kgTexto(it.quantidadeKg))}</strong></li>`).join('')}</ul>
        </details>`;
      })
      .join('') || '<p class="sub">Nenhuma torra registrada ainda. Use "Cadastrar torra".</p>';
}

/** Linha do formulário: café + quantidade (kg) + remover. */
function linhaDeCafe(): HTMLElement {
  const linha = document.createElement('div');
  linha.className = 'torra-linha';
  const ativos = ordenarCafes(cafes.filter((c) => c.ativo));
  linha.innerHTML = `<select class="torra-cafe" aria-label="Café"><option value="">Café…</option>${ativos.map((c) => `<option value="${esc(c.id)}">${esc(textoNaLista(c, ativos))}</option>`).join('')}</select>
    <input class="torra-kg" type="text" inputmode="decimal" placeholder="kg" aria-label="Quantidade em kg" autocomplete="off">
    <button type="button" class="fila-btn danger torra-remover" aria-label="Remover esta linha" title="Remover">✕</button>`;
  return linha;
}
function atualizarRemover(): void {
  const linhas = $('torra-linhas').querySelectorAll('.torra-linha');
  linhas.forEach((l) => ((l.querySelector('.torra-remover') as HTMLButtonElement).hidden = linhas.length === 1));
}
$('nova-torra').addEventListener('click', () => {
  ($('torra-data') as HTMLInputElement).value = today();
  ($('torra-quem') as HTMLInputElement).value = '';
  $('torra-linhas').replaceChildren(linhaDeCafe());
  atualizarRemover();
  $('erro-torra').textContent = '';
  ($('dlg-torra') as HTMLDialogElement).showModal();
  $('torra-quem').focus();
});
$('torra-mais').addEventListener('click', () => {
  const l = linhaDeCafe();
  $('torra-linhas').appendChild(l);
  atualizarRemover();
  (l.querySelector('select') as HTMLElement).focus();
});
$('torra-linhas').addEventListener('click', (ev) => {
  const b = (ev.target as HTMLElement).closest('.torra-remover');
  if (!b) return;
  b.closest('.torra-linha')?.remove();
  atualizarRemover();
});
$('cancelar-torra').addEventListener('click', () => ($('dlg-torra') as HTMLDialogElement).close());
$('form-torra').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const itens = [...$('torra-linhas').querySelectorAll('.torra-linha')].map((l) => ({
    cafeId: (l.querySelector('.torra-cafe') as HTMLSelectElement).value,
    quantidadeKg: parseKg((l.querySelector('.torra-kg') as HTMLInputElement).value) ?? 0,
  }));
  const nova = { dataTorra: val('torra-data'), torrador: val('torra-quem'), itens };
  const erro = erroDaTorra(nova);
  if (erro) return void ($('erro-torra').textContent = erro);
  const btn = $('torra-salvar') as HTMLButtonElement;
  btn.disabled = true;
  try {
    await torras.registrar(nova);
    ($('dlg-torra') as HTMLDialogElement).close();
    mostrarToast('Torra cadastrada', `${plural(itens.length, 'café', 'cafés')} em ${dataBR(nova.dataTorra)}`);
    await renderTorras();
  } catch (e) {
    $('erro-torra').textContent = e instanceof Error ? e.message : 'Erro inesperado.';
  } finally {
    btn.disabled = false;
  }
});

// ---------- estoque (MOCADO: só interface; ainda sem ligação com torras, pedidos nem banco)
/** Quantidade de exemplo (0 a ~25 kg), sempre a mesma para o mesmo café. */
function quantidadeDeExemplo(id: string): number {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h % 9 === 0 ? 0 : Math.round(((h % 2500) / 100) * 2) / 2;
}
const LIMITE_BAIXO_KG = 3;
function renderEstoque(): void {
  const filtro = val('estoque-busca').trim().toLowerCase();
  const lista = ordenarCafes(cafes.filter((c) => c.ativo)).filter((c) => !filtro || c.nome.toLowerCase().includes(filtro));
  $('lista-estoque').innerHTML =
    lista
      .map((c) => {
        const kg = quantidadeDeExemplo(c.id);
        const nivel = kg === 0 ? 'zero' : kg < LIMITE_BAIXO_KG ? 'baixo' : 'ok';
        const texto = { zero: 'Sem estoque', baixo: 'Estoque baixo', ok: 'Disponível' }[nivel];
        return `<div class="estoque-item">
          <div class="estoque-topo"><strong>${esc(textoNaLista(c, cafes))}</strong><span class="estoque-saldo ${kg > 0 ? '' : 'zero'}">${esc(kgTexto(kg))}</span></div>
          <div class="estoque-meta"><span class="selo-nivel ${nivel}">${texto}</span><div class="barra" aria-hidden="true"><i style="width:${Math.min(100, (kg / 25) * 100)}%"></i></div></div>
        </div>`;
      })
      .join('') || '<p class="sub">Nenhum café encontrado.</p>';
}
$('estoque-busca').addEventListener('input', renderEstoque);

// ---------- conta e dados
$('sair').addEventListener('click', async () => {
  await sair().catch(() => undefined);
  repo.limparCacheCafes();
  mostrarLogin();
});
$('enviar-locais').addEventListener('click', async () => {
  const btn = $('enviar-locais') as HTMLButtonElement;
  btn.disabled = true;
  aviso($('aviso-conta'), '', 'Enviando…');
  try {
    const locais = await cafesLocais.list();
    const antes = (await book.list()).length;
    await cafeRepo.importar(locais);
    await recarregarCafes();
    const novos = cafes.length - antes;
    aviso($('aviso-conta'), 'ok', novos > 0 ? `✔ ${plural(novos, 'café novo foi enviado', 'cafés novos foram enviados')} para o banco.` : '✔ Nada a enviar: o banco já tem todos os cafés deste navegador.');
  } catch (e) {
    aviso($('aviso-conta'), 'fail', '✖ ' + (e instanceof Error ? e.message : 'Erro inesperado.'));
  } finally {
    btn.disabled = false;
  }
});

// ---------- cópia de segurança
$('backup-baixar').addEventListener('click', async () => {
  const blob = new Blob([JSON.stringify(exportBackup(await book.list(), repo.getConfig()), null, 2)], { type: 'application/json' });
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
    if (!confirm('Restaurar vai aplicar as configurações do arquivo e acrescentar ao banco os cafés que ainda não existem nele. Continuar?')) return;
    await importBackup(cafeRepo, repo, JSON.parse(await file.text()));
    loadConfig();
    await loadCafes();
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
renderFila();

// ---------- entrada (login) e início
function mostrarLogin(): void {
  document.body.classList.add('sem-login');
  ($('login-senha') as HTMLInputElement).value = '';
  $('login-email').focus();
}
async function iniciarSessao(): Promise<void> {
  document.body.classList.remove('sem-login');
  await loadCafes();
}
$('form-login').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const btn = $('login-entrar') as HTMLButtonElement;
  btn.disabled = true;
  aviso($('aviso-login'), '', 'Entrando…');
  try {
    await entrar(val('login-email'), val('login-senha'));
    aviso($('aviso-login'), '', '');
    await iniciarSessao();
  } catch (e) {
    aviso($('aviso-login'), 'fail', '✖ ' + (e instanceof Error ? e.message : 'Erro inesperado.'));
  } finally {
    btn.disabled = false;
  }
});
aoTerminarSessao(mostrarLogin);

async function iniciar(): Promise<void> {
  await loadFonts();
  if (await sessaoAtiva()) await iniciarSessao();
  else mostrarLogin();
}
iniciar().catch(erroDeDados);
