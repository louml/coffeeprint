# Torra Local – Emissão de rótulos

Aplicativo que gera e imprime o rótulo de cada pacote de café já preenchido (café, peso, moagem, data de torra e cliente), no tamanho da etiqueta de **80 × 100 mm**, pela impressora instalada no Windows (**Elgin L42 PRO**).

O app inteiro é **um único arquivo: [`index.html`](index.html)**. Roda direto do disco, no Chrome ou Edge, **sem internet, sem servidor e sem instalar nada**. Código, estilos, fontes e selo estão dentro dele.

## Como usar

1. **Baixe o `index.html`** (no GitHub: abra o arquivo e clique em *Download raw file*) e salve em uma pasta fixa, por exemplo `C:\TorraLocal\Rotulos.html`. O nome pode ser outro.
2. **Dê dois cliques** nele (abre no Chrome ou Edge; se abrir em outro navegador, botão direito → *Abrir com*).
3. **Atalho no desktop:** botão direito no arquivo → *Enviar para* → *Área de trabalho (criar atalho)*. Para abrir como janela de aplicativo, crie um atalho para o Chrome com o destino:
   `"C:\Program Files\Google\Chrome\Application\chrome.exe" --app=file:///C:/TorraLocal/Rotulos.html`

### Ícone do atalho

1. Baixe também o arquivo [`assets/torra-local.ico`](assets/torra-local.ico) (no GitHub: *Download raw file*) e salve **na mesma pasta do app**, por exemplo `C:\TorraLocal\torra-local.ico`. O atalho guarda o caminho do ícone, então não mude o arquivo de lugar depois.
2. Clique com o botão direito no atalho da Área de Trabalho → **Propriedades**.
3. Na aba **Atalho**, clique em **Alterar Ícone…** → **Procurar…** → escolha `torra-local.ico` → **OK** → **OK**.

**Atualizar o app:** baixe o novo `index.html` e substitua o arquivo antigo. Cafés e configurações não se perdem (ficam no navegador, não no arquivo).

## Instalar a impressora (uma vez só)

1. Instale o **driver da L42 PRO** no Windows e confirme que ela aparece em Configurações → Impressoras e scanners.
2. No driver, crie um papel personalizado do tamanho da etiqueta do rolo (**80 × 100 mm** em pé ou **100 × 80 mm** deitada), **sem margens**.

## Primeira impressão de teste

1. Abra **Configurações**. Se a etiqueta do rolo for **deitada (100 × 80 mm)**, escolha em *Orientação da impressão* "Deitada: girar 90° à direita".
2. Clique em **Imprimir etiqueta de teste**. Na janela de impressão do navegador: impressora **L42 PRO**, margens **Nenhuma**, escala **100%**, cabeçalhos e rodapés **desligados**, papel do tamanho da etiqueta.
3. Se o texto sair de cabeça para baixo, use "girar 90° à esquerda". Se sair cortado ou pequeno, ajuste papel e escala no diálogo e no driver.

### Imprimir sem a janela de impressão (opcional)

O Chrome imprime direto na **impressora padrão do Windows** com a opção `--kiosk-printing`. Deixe a L42 como impressora padrão e acrescente ` --kiosk-printing` ao final do destino do atalho do Chrome (passo 3 acima). Nesse modo valem o papel e as margens configurados no driver.

## Uso diário

1. Em **Emitir rótulo**: escolha o café, o peso e a moagem, digite o cliente, confira a pré-visualização e clique em **Imprimir** (cada cópia sai em uma página).
2. Depois de imprimir, café, peso, moagem e data são mantidos; só o cliente é limpo.
3. O navegador **não informa se a impressora imprimiu**: "enviadas para impressão" significa que o pedido foi entregue ao Windows. Se nada sair, veja a fila de impressão do Windows (impressora desligada, sem papel, offline).

## Cafés, selo e cópia de segurança

- **Cafés:** adicionar, editar, remover ou **desativar** (some da lista de emissão, sem ser apagado). O texto de cada campo sai no rótulo como foi digitado. O campo *Título do campo produtor* permite "Produtora", "Produtores" etc.
- **Configurações:** liga/desliga o selo de fundo, orientação da impressão e **Modo sem impressora** (baixa o rótulo como imagem PNG).
- **Onde ficam os dados:** os cafés e as configurações ficam no **armazenamento do navegador** deste computador (não no arquivo, não na internet). Permanecem ao fechar o navegador, reiniciar o computador, mover ou renomear o arquivo. **Somem** se alguém limpar os dados de navegação, ou em janela anônima; outro navegador, perfil ou computador começa só com os cafés iniciais. Use **Configurações → Baixar cópia de segurança** de vez em quando e **Restaurar de uma cópia** para recuperar.
- **Cafés iniciais:** vêm cadastrados com o app (lista em [`src/label/cafes-iniciais.ts`](src/label/cafes-iniciais.ts)). Quem já usa o app recebe só os novos, sem perder nem recriar o que apagou.

---

## Para desenvolvedores

```
npm install   # dependências (só para gerar o arquivo e rodar os testes)
npm run build # gera o index.html a partir de src/ e assets/
npm run icone # (raramente) gera de novo assets/torra-local.ico a partir do selo
npm test      # confere os tipos, roda os testes e verifica se o index.html está atualizado
```

**O `index.html` da raiz é gerado.** Não edite à mão: mude `src/` e rode `npm run build`; o teste falha se o arquivo estiver desatualizado.

```
index.html              o app (gerado)
src/index.html          modelo da página (com marcadores que o build preenche)
src/style.css           estilos
src/app.ts              telas e fluxo
src/env.ts              canvas e fontes no navegador
src/print.ts            impressão pelo navegador (uma página por cópia)
src/storage.ts          cadastro de cafés, configurações e cópia de segurança (interface Repository)
src/request.ts          validação e textos da lista
src/label/draw.ts       desenho do rótulo em imagem de 1 bit (640 × 800 pontos, 203 dpi)
src/label/cafes-iniciais.ts  cafés que já vêm cadastrados (com versão da lista)
scripts/build.mjs       empacota tudo em um arquivo (esbuild; fontes e selo como data URI)
scripts/icone.mjs       gera o ícone do atalho a partir do selo
assets/                 fontes Inter (licença OFL), o selo da marca e o ícone do atalho (.ico)
docs/modelo-do-rotulo.png    modelo de referência do rótulo
test/                   testes (node:test)
```

- Aberto via `file://`, o navegador bloqueia scripts e imagens externos; por isso fontes e selo vão embutidos e não há service worker.
- A pré-visualização e a impressão usam a **mesma imagem** gerada por `draw.ts`.
- Para **acrescentar cafés iniciais**: adicione ao fim de `CAFES_INICIAIS` com `desde` = `SEED_VERSION + 1`, aumente `SEED_VERSION`, rode `npm run build` e troque o arquivo nos computadores.
- A interface `Repository` permite trocar o armazenamento do navegador por outro (arquivo, nuvem) sem mexer no resto.
