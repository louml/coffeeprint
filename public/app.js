'use strict';
const $ = (id) => document.getElementById(id);
const api = async (url, method = 'GET', body) => {
  const res = await fetch(url, { method, headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined });
  if (res.status === 204) return null;
  const type = res.headers.get('content-type') || '';
  const data = type.includes('json') ? await res.json() : await res.blob();
  if (!res.ok) throw Object.assign(new Error(data.erro || 'Erro inesperado.'), { campos: data.campos });
  return data;
};
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const FIELDS = { cliente: 'Cliente', cafe: 'Café', peso: 'Peso', moagem: 'Moagem', data: 'Data de torra', copias: 'Número de cópias' };

// ---------- abas
document.querySelectorAll('.tab').forEach((b) => b.addEventListener('click', () => {
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t === b));
  document.querySelectorAll('.panel').forEach((p) => p.classList.toggle('active', p.id === b.dataset.tab));
  if (b.dataset.tab === 'emitir') loadCafes();
  if (b.dataset.tab === 'cafes') renderCafes();
  if (b.dataset.tab === 'config') loadConfig();
}));

// ---------- emissão
let cafes = [];
const pedido = () => ({ cafeId: $('cafe').value, cliente: $('cliente').value, peso: $('peso').value, moagem: $('moagem').value, dataTorra: $('data').value, copias: Number($('copias').value) });

async function loadCafes() {
  cafes = await api('/api/cafes');
  const atual = $('cafe').value;
  const ativos = cafes.filter((c) => c.ativo);
  $('cafe').innerHTML = '<option value="">Escolha…</option>' + ativos.map((c) => `<option value="${c.id}">${esc(c.nome)}</option>`).join('');
  if (ativos.some((c) => c.id === atual)) $('cafe').value = atual;
  else if (ativos.length === 1) $('cafe').value = ativos[0].id;
  refreshPreview();
}
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let previewTimer, previewSeq = 0, lastUrl;
function refreshPreview() {
  clearTimeout(previewTimer);
  previewTimer = setTimeout(async () => {
    const seq = ++previewSeq;
    try {
      const blob = await api('/api/label/preview', 'POST', pedido());
      if (seq !== previewSeq) return;
      if (!blob) { $('previa').hidden = true; $('previa-vazia').hidden = false; return; }
      const url = URL.createObjectURL(blob);
      $('previa').src = url; $('previa').hidden = false; $('previa-vazia').hidden = true;
      if (lastUrl) URL.revokeObjectURL(lastUrl);
      lastUrl = url;
    } catch (e) { if (seq === previewSeq) { $('previa').hidden = true; $('previa-vazia').hidden = false; $('previa-vazia').textContent = 'Não foi possível gerar a pré-visualização.'; } }
  }, 150);
}

function aviso(el, tipo, texto) { el.className = tipo; el.textContent = texto; }
function limpaMarcas() { document.querySelectorAll('.invalido').forEach((e) => e.classList.remove('invalido')); }

['cliente', 'cafe', 'peso', 'moagem', 'data', 'copias'].forEach((id) => {
  $(id).addEventListener('input', () => { $(id).classList.remove('invalido'); aviso($('aviso'), '', ''); refreshPreview(); });
});

$('form').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  limpaMarcas();
  const p = pedido();
  const faltam = [];
  if (!p.cliente.trim()) faltam.push('cliente');
  if (!p.cafeId) faltam.push('cafe');
  if (!p.peso) faltam.push('peso');
  if (!p.moagem) faltam.push('moagem');
  if (!p.dataTorra) faltam.push('data');
  if (!Number.isInteger(p.copias) || p.copias < 1 || p.copias > 500) faltam.push('copias');
  if (faltam.length) {
    faltam.forEach((id) => $(id).classList.add('invalido'));
    aviso($('aviso'), 'fail', `Não imprimi. Falta preencher: ${faltam.map((id) => FIELDS[id]).join(', ')}.`);
    $(faltam[0]).focus();
    return;
  }
  $('imprimir').disabled = true;
  aviso($('aviso'), '', 'Enviando para a impressora…');
  try {
    const r = await api('/api/label/print', 'POST', p);
    aviso($('aviso'), 'ok', '✔ ' + r.mensagem);
    // mantém café, peso, moagem e data; limpa só o cliente
    $('cliente').value = '';
    refreshPreview();
    $('cliente').focus();
  } catch (e) {
    aviso($('aviso'), 'fail', '✖ ' + e.message);
  } finally {
    $('imprimir').disabled = false;
  }
});

// ---------- cadastro de cafés
function renderCafes() {
  api('/api/cafes').then((lista) => {
    cafes = lista;
    $('lista-cafes').innerHTML = lista.map((c) => `
      <div class="cafe-item ${c.ativo ? '' : 'inativo'}">
        <div class="info"><strong>${esc(c.nome)}</strong>${c.ativo ? '' : '<span class="tag">Inativo</span>'}
          <small>${esc([c.notas, c.produtor, c.regiao].filter(Boolean).join(' · '))}</small></div>
        <button data-act="edit" data-id="${c.id}">Editar</button>
        <button data-act="toggle" data-id="${c.id}">${c.ativo ? 'Desativar' : 'Ativar'}</button>
        <button data-act="del" data-id="${c.id}" class="danger">Remover</button>
      </div>`).join('') || '<p>Nenhum café cadastrado.</p>';
  });
}
$('lista-cafes').addEventListener('click', async (ev) => {
  const b = ev.target.closest('button'); if (!b) return;
  const c = cafes.find((x) => x.id === b.dataset.id); if (!c) return;
  if (b.dataset.act === 'edit') openCafe(c);
  if (b.dataset.act === 'toggle') { await api('/api/cafes/' + c.id, 'PUT', { ...c, ativo: !c.ativo }); renderCafes(); }
  if (b.dataset.act === 'del' && confirm(`Remover "${c.nome}" de vez? Para só esconder da lista, use "Desativar".`)) { await api('/api/cafes/' + c.id, 'DELETE'); renderCafes(); }
});
let editId = null;
function openCafe(c) {
  editId = c ? c.id : null;
  const f = $('form-cafe');
  $('dlg-titulo').textContent = c ? 'Editar café' : 'Novo café';
  for (const k of ['nome', 'notas', 'produtor', 'variedade', 'regiao', 'especie', 'torra']) f.elements[k].value = c ? c[k] : (k === 'especie' ? '100% Arábica' : '');
  f.elements.ativo.checked = c ? c.ativo : true;
  $('erro-cafe').textContent = '';
  $('dlg-cafe').showModal();
  f.elements.nome.focus();
}
$('novo-cafe').addEventListener('click', () => openCafe(null));
$('cancelar-cafe').addEventListener('click', () => $('dlg-cafe').close());
$('form-cafe').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const f = $('form-cafe');
  const body = Object.fromEntries(['nome', 'notas', 'produtor', 'variedade', 'regiao', 'especie', 'torra'].map((k) => [k, f.elements[k].value]));
  body.ativo = f.elements.ativo.checked;
  if (!body.nome.trim()) { $('erro-cafe').textContent = 'Informe o nome do café.'; return; }
  try {
    await (editId ? api('/api/cafes/' + editId, 'PUT', body) : api('/api/cafes', 'POST', body));
    $('dlg-cafe').close();
    renderCafes();
  } catch (e) { $('erro-cafe').textContent = e.message; }
});

// ---------- configurações
async function loadConfig() {
  const c = await api('/api/config');
  $('cfg-endereco').value = c.enderecoImpressora;
  $('cfg-selo').checked = c.selo;
  $('cfg-offline').checked = c.modoSemImpressora;
}
const lerConfig = () => ({ enderecoImpressora: $('cfg-endereco').value, selo: $('cfg-selo').checked, modoSemImpressora: $('cfg-offline').checked });
$('form-config').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  try { await api('/api/config', 'PUT', lerConfig()); aviso($('aviso-config'), 'ok', '✔ Configurações salvas.'); refreshPreview(); }
  catch (e) { aviso($('aviso-config'), 'fail', '✖ ' + e.message); }
});
$('procurar').addEventListener('click', async () => {
  $('procurar').disabled = true;
  $('achados').innerHTML = '';
  aviso($('aviso-config'), '', 'Procurando a impressora na rede… (leva até 20 segundos)');
  try {
    const { enderecos } = await api('/api/printer/discover');
    if (!enderecos.length) {
      aviso($('aviso-config'), 'fail', 'Não encontrei nenhuma impressora. Veja se ela está ligada e ligada na mesma rede (cabo ou Wi-Fi) deste computador.');
    } else {
      aviso($('aviso-config'), 'ok', enderecos.length === 1 ? 'Encontrei 1 impressora. Clique no endereço para usá-lo:' : `Encontrei ${enderecos.length} equipamentos. Clique no endereço da impressora:`);
      $('achados').innerHTML = enderecos.map((ip) => `<button type="button" class="big achado" data-ip="${esc(ip)}">${esc(ip)}</button>`).join(' ');
    }
  } catch (e) { aviso($('aviso-config'), 'fail', '✖ ' + e.message); }
  finally { $('procurar').disabled = false; }
});
$('achados').addEventListener('click', (ev) => {
  const b = ev.target.closest('.achado'); if (!b) return;
  $('cfg-endereco').value = b.dataset.ip;
  aviso($('aviso-config'), 'ok', `Endereço ${b.dataset.ip} preenchido. Clique em "Imprimir etiqueta de teste" e depois em "Salvar configurações".`);
});

$('teste').addEventListener('click', async () => {
  $('teste').disabled = true;
  aviso($('aviso-config'), '', 'Enviando etiqueta de teste…');
  try {
    // o teste usa o endereço digitado agora e o modo escolhido, mesmo que ainda não tenham sido salvos
    await api('/api/config', 'PUT', lerConfig());
    const r = await api('/api/printer/test', 'POST', { enderecoImpressora: $('cfg-endereco').value });
    aviso($('aviso-config'), 'ok', '✔ ' + r.mensagem);
  } catch (e) { aviso($('aviso-config'), 'fail', '✖ ' + e.message); }
  finally { $('teste').disabled = false; }
});

$('data').value = today();
loadCafes();
