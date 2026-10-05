# Torra Local – Emissão de rótulos

Aplicativo que gera e imprime o rótulo de cada pacote de café já preenchido (café, peso, moagem, data de torra e cliente), direto na impressora **Elgin L42 PRO** (etiqueta de 80 mm de largura × 100 mm de altura).

## Instalar (uma vez só, no computador da torrefação – Windows)

1. Instale o **Node.js** (versão **LTS**): baixe em <https://nodejs.org> e vá clicando em "Next".
2. Copie a pasta deste aplicativo para o computador (por exemplo, para a Área de Trabalho).
3. Dê um **duplo clique em `iniciar.bat`**. Na primeira vez ele baixa o que falta (precisa de internet, leva alguns minutos). Depois disso o app funciona **sem internet**.

## Usar no dia a dia

1. Duplo clique em **`iniciar.bat`**. Abre uma janela preta (deixe aberta) e o navegador abre o app em <http://localhost:3000>.
2. Na aba **Emitir rótulo**: escolha o café, o peso e a moagem, digite o cliente, confira a pré-visualização e clique em **Imprimir**.
3. Depois de imprimir, o app mantém café, peso, moagem e data e limpa só o cliente, para o próximo pedido.
4. Para fechar o app, feche a janela preta.

## Primeira impressão de teste

1. Ligue a impressora, com etiquetas de 80 × 100 mm, e confirme que ela está ligada na mesma rede do computador (cabo de rede ou Wi-Fi).
2. No app, abra **Configurações** e clique em **Procurar impressora na rede**. O app mostra os endereços encontrados; clique no da impressora (ex.: `192.168.15.20`) para preenchê-lo. Depois clique em **Imprimir etiqueta de teste**.
   - Atenção: o endereço que aparece embaixo do roteador (ex.: `192.168.15.1`) é o do **roteador**, não o da impressora.
   - Se a busca não achar nada, veja a lista de aparelhos conectados na página do roteador, ou consulte o manual da L42 PRO para imprimir a página de configuração de rede dela.
3. Se aparecer "✔ 1 etiqueta enviada para a impressora" e a etiqueta sair, está pronto. Clique em **Salvar configurações**.
4. Se a etiqueta sair virada (de cabeça para baixo ou deitada), escolha outra opção em **Orientação da impressão**, salve e imprima o teste de novo até sair certa.
5. Se a etiqueta sair desalinhada ou a impressora pular etiquetas, calibre o sensor de etiquetas (gap) pelo botão FEED / pelo manual da L42 PRO e teste de novo.

Sem impressora (testes): em **Configurações**, marque **Modo sem impressora**. O botão Imprimir passa a salvar o rótulo como imagem PNG na pasta `saida`.

## Cafés e selo

- Aba **Cafés**: adicionar, editar, remover ou **desativar** (o café inativo some da lista de emissão, mas não é apagado). Já vem cadastrado o *Arara da Mogiana*.
- Em **Configurações** dá para ligar/desligar o selo "Cafés Especiais / Torra Local" ao fundo. Se na impressão ele atrapalhar a leitura, desligue.

Cafés e configurações ficam salvos na pasta `data` e permanecem após reiniciar. **Faça cópia dessa pasta de vez em quando.**

## Se algo der errado

| Mensagem | O que fazer |
|---|---|
| "Não consegui encontrar a impressora" / "recusou a conexão" | Veja se está ligada e na mesma rede, e se o IP em Configurações está certo. |
| "Node.js não está instalado" | Instale o Node.js LTS (passo 1). |
| Navegador não abre | Abra manualmente <http://localhost:3000>. |

---

## Para desenvolvedores

```
npm install      # dependências
npm run build    # compila TypeScript para dist/
npm start        # http://localhost:3000   (PORT, HOST, DATA_DIR, OUT_DIR configuráveis por variável de ambiente)
npm test         # compila e roda os testes
```

- `src/core/service.ts` – **núcleo**: `LabelService` valida o pedido, gera o rótulo e envia à impressora. Independe de HTTP e pode ser chamado por outros sistemas.
- `src/core/label/` – desenho do rótulo (layout, fontes, selo) em imagem de 1 bit, 203 dpi (640 × 800 pontos). A **mesma imagem** é usada na pré-visualização e na impressão.
- `src/core/printer/` – conversão para ZPL e envio TCP (porta 9100).
- `src/core/storage/` – cadastro de cafés e configurações em JSON (`data/`).
- `src/server/` – API HTTP; `public/` – interface web.
- Fontes (Open Sans, Bebas Neue – licença OFL) e o selo ficam em `assets/`.
