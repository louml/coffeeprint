# Torra Local – Emissão de rótulos (versão web)

Aplicativo que roda no **navegador (Chrome ou Edge)**, abrindo um único arquivo `index.html` do próprio computador. Gera o rótulo já preenchido (café, peso, moagem, data de torra e cliente) e imprime pela impressora instalada no Windows (**Elgin L42 PRO**), como qualquer site.

> Esta versão imprime pelo **driver do Windows**. A versão que envia direto à impressora pela rede (ZPL, sem driver) continua no repositório e está descrita em [`README-LOCAL.md`](README-LOCAL.md).

## Como usar: um arquivo só, sem instalar nada

O app inteiro é **um único arquivo: `index.html`** (código, fontes e selo estão dentro dele). Ele roda direto do disco, **sem internet, sem servidor, sem Node.js e sem `.bat`**. Nada fica público.

1. **Baixe o arquivo**: no GitHub, abra o `index.html` do repositório (branch `claude/versao-web-driver`) e clique em **Download raw file** (ícone de seta para baixo), ou use **Code → Download ZIP** e pegue o `index.html` de dentro. Salve em uma pasta fixa, por exemplo `C:\TorraLocal\Rotulos.html` (o nome pode ser outro).
2. **Abra com duplo clique** (no Chrome ou Edge). Se abrir em outro navegador, clique com o botão direito → *Abrir com* → Chrome/Edge.
3. **Crie o atalho no desktop**: botão direito no arquivo → *Enviar para* → *Área de trabalho (criar atalho)*.
4. Para abrir como janela de aplicativo (sem barra de endereço), crie um atalho para o Chrome com o destino: `"C:\Program Files\Google\Chrome\Application\chrome.exe" --app=file:///C:/TorraLocal/Rotulos.html`

**Atualizar o app:** baixe o novo `index.html` e substitua o arquivo antigo. Os cafés e as configurações **não se perdem**, porque ficam guardados no navegador, não no arquivo.

**Onde ficam os dados:** no navegador (Chrome/Edge) deste computador. Eles permanecem ao fechar o navegador, reiniciar o computador, mover ou renomear o arquivo. Somem se alguém limpar os "dados de navegação" (cookies e dados de sites). Use **Configurações → Baixar cópia de segurança** de vez em quando. Use sempre o mesmo navegador e perfil.

## Diferenças em relação à versão com servidor local

| | Este app (arquivo único) | Versão local (`README-LOCAL.md`) |
|---|---|---|
| Iniciar | Duplo clique no arquivo | `iniciar.bat` + janela preta |
| Aviso de risco do Windows | Não há | Aparece |
| Impressão | Pelo driver do Windows | Direta pela rede (ZPL) |
| Janela de impressão | Aparece, a menos que se use o atalho "silencioso" (abaixo) | Nunca aparece |
| Erro "impressora desligada" | **O app não sabe**; quem avisa é a fila de impressão do Windows | Mensagem clara no app |
| Cafés e configurações | Guardados no navegador deste computador | Arquivos na pasta `data` |

## Instalar o driver (uma vez só)

1. Instale o **driver da L42 PRO no Windows** e confirme que a impressora aparece em Configurações → Impressoras e scanners.
2. No driver, crie um papel personalizado do mesmo tamanho da etiqueta do rolo (**80 × 100 mm** em pé ou **100 × 80 mm** deitada), **sem margens**.

## Primeira impressão de teste

1. Abra o app → **Configurações**.
2. Se a etiqueta do rolo for **deitada (100 × 80 mm)**, escolha em *Orientação da impressão* "Etiqueta deitada: girar 90° para a direita".
3. Clique em **Imprimir etiqueta de teste**. Na janela de impressão do navegador:
   - **Impressora:** a L42 PRO.
   - **Margens:** Nenhuma. **Escala:** 100% (ou "Padrão"). **Cabeçalhos e rodapés:** desligados.
   - **Tamanho do papel:** o mesmo da etiqueta (80 × 100 mm ou 100 × 80 mm).
4. Se o texto sair de cabeça para baixo, use "girar 90° para a esquerda". Se sair cortado ou pequeno, ajuste o papel/escala no diálogo e no driver.

## Imprimir sem a janela de impressão (opcional)

O Chrome tem um modo que imprime direto na **impressora padrão do Windows**, sem janela. Para usá-lo:

1. Deixe a L42 como **impressora padrão** (Configurações → Impressoras e scanners).
2. No atalho do Chrome criado no passo 4 (o que usa `--app=`), acrescente ao final do campo **Destino**, depois de um espaço: `--kiosk-printing`.
3. Abra o app por esse atalho. Agora o botão **Imprimir** envia direto, usando o papel e as configurações padrão do driver. Por isso o passo 2 da instalação (papel e margens no driver) é obrigatório neste modo.

> Eu não consegui testar o modo silencioso nem o driver numa L42 real. Se o tamanho, o giro ou a nitidez saírem diferentes do esperado, o ajuste costuma ser no driver (papel, margens, "sem escala").

## Uso diário

1. Abra o app pelo atalho.
2. **Emitir rótulo**: escolha café, peso e moagem, digite o cliente, confira a pré-visualização e clique em **Imprimir** (o número de cópias gera uma página por cópia).
3. Depois de imprimir, café, peso, moagem e data são mantidos; só o cliente é limpo.
4. Aviso importante: o navegador não informa se a impressora realmente imprimiu. "Enviadas para impressão" significa que o pedido foi entregue ao Windows. Se nada sair, veja a fila de impressão do Windows (impressora desligada, sem papel, offline).

## Cafés, selo e cópia de segurança

- Aba **Cafés**: adicionar, editar, remover ou **desativar** (some da lista de emissão, mas não é apagado). Já vem cadastrado o *Arara da Mogiana*. O texto de cada campo sai no rótulo exatamente como foi digitado (por exemplo, "Torra média"); se um café cadastrado antes da atualização do modelo ainda mostra "Torra Média", edite-o em **Cafés → Editar**.
- Em **Configurações**: liga/desliga o selo "Cafés Especiais / Torra Local" ao fundo, orientação da impressão e **Modo sem impressora** (baixa o rótulo como imagem PNG).
- **Cópia de segurança:** os cafés e configurações ficam guardados **neste navegador, neste computador**. Se os dados de navegação forem apagados, eles somem. Em Configurações há **Baixar cópia de segurança** e **Restaurar de uma cópia**. Faça uma cópia de vez em quando e antes de trocar de computador.

---

## Para desenvolvedores

```
npm install          # dependências
npm test             # compila (servidor e site), roda os testes e confere se o index.html está atualizado
npm run build:single # gera o index.html (arquivo único) na raiz: faça commit dele
npm run site         # (opcional) pasta site/ para hospedagem estática, em http://localhost:8080
```

- **`index.html` na raiz é gerado.** Não edite à mão: mude `src/` ou `site-src/` e rode `npm run build:single`. O teste falha se ele estiver desatualizado.
- `src/core/label/draw.ts` – desenho do rótulo, **compartilhado** pelo servidor (Node) e pelo navegador. Cada ambiente injeta seu canvas e suas fontes.
- `src/web/` – app do navegador: `app.ts` (telas), `env.ts` (canvas/fontes), `print.ts` (impressão pelo navegador), `storage.ts` (cadastro, configurações e backup, atrás da interface `Repository`), `request.ts` (validação).
- `site-src/` – HTML e CSS de origem; `scripts/single.mjs` empacota tudo no `index.html` (esbuild), e `scripts/build-site.mjs` monta a pasta `site/` para hospedagem.
- Aberto via `file://`, o navegador bloqueia scripts e imagens externos; por isso fontes e selo vão embutidos (data URI) e não há service worker nem instalação como PWA nesse modo.
- A interface `Repository` permite trocar o armazenamento do navegador por um serviço na nuvem no futuro.
- Fora do escopo desta versão: login, histórico de impressões, ERP, importação em lote.
