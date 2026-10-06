# Torra Local – Emissão de rótulos (versão web)

Aplicativo que roda no **navegador (Chrome ou Edge)**, sem nada para instalar além de um atalho. Gera o rótulo já preenchido (café, peso, moagem, data de torra e cliente) e imprime pela impressora instalada no Windows (**Elgin L42 PRO**), como qualquer site.

> Esta versão imprime pelo **driver do Windows**. A versão que envia direto à impressora pela rede (ZPL, sem driver) continua no repositório e está descrita em [`README-LOCAL.md`](README-LOCAL.md).

## O que muda em relação à versão com servidor local

| | Versão web (este arquivo) | Versão local |
|---|---|---|
| Iniciar | Atalho no desktop, abre como app | `iniciar.bat` + janela preta |
| Aviso de risco do Windows | Não há (é um site) | Aparece |
| Impressão | Pelo driver do Windows | Direto pela rede (ZPL) |
| Janela de impressão | Aparece, a menos que se use o atalho "silencioso" (abaixo) | Nunca aparece |
| Erro "impressora desligada" | **O app não sabe**; quem avisa é a fila de impressão do Windows | Mensagem clara no app |
| Cafés e configurações | Guardados no navegador deste computador (+ cópia de segurança em arquivo) | Arquivos na pasta `data` |

## Instalar (uma vez só, no computador da torrefação)

1. **Instale o driver da L42 PRO no Windows** (baixe no site da Elgin) e confirme que a impressora aparece em Configurações → Impressoras e scanners.
2. **Configure o tamanho do papel no driver**: Preferências de impressão → papel personalizado do mesmo tamanho da etiqueta do rolo (**80 × 100 mm** em pé ou **100 × 80 mm** deitada), **sem margens**.
3. No Chrome ou Edge, abra o endereço do app (quem publicou o site informa o endereço). No Chrome: menu ⋮ → *Transmitir, salvar e compartilhar* → **Instalar página como aplicativo** (no Edge: ⋯ → *Aplicativos* → **Instalar este site como um aplicativo**). Marque a opção de criar atalho na Área de Trabalho.
4. Depois disso o app abre pelo atalho, em janela própria, e **funciona também sem internet** (a internet só é necessária no primeiro acesso e para receber atualizações).

## Testar antes de publicar (no próprio computador)

1. Baixe a pasta do projeto da branch `claude/versao-web-driver` (no GitHub: botão **Code → Download ZIP**, com essa branch selecionada) e extraia. Clique com o botão direito no `.zip` → Propriedades → **Desbloquear** *antes* de extrair, para evitar avisos do Windows.
2. Dê um duplo clique em **`testar-site.bat`** (precisa do Node.js LTS; na primeira vez baixa o que falta). O navegador abre em <http://localhost:8080>.
3. Siga a seção seguinte. Feche a janela preta para encerrar.

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
2. Clique com o botão direito no atalho do app → **Propriedades** → no campo **Destino**, acrescente ao final, depois de um espaço: `--kiosk-printing`.
3. Abra o app por esse atalho. Agora o botão **Imprimir** envia direto, usando o papel e as configurações padrão do driver. Por isso o passo 2 da instalação (papel e margens no driver) é obrigatório neste modo.

> Eu não consegui testar o modo silencioso nem o driver numa L42 real. Se o tamanho, o giro ou a nitidez saírem diferentes do esperado, o ajuste costuma ser no driver (papel, margens, "sem escala").

## Uso diário

1. Abra o app pelo atalho.
2. **Emitir rótulo**: escolha café, peso e moagem, digite o cliente, confira a pré-visualização e clique em **Imprimir** (o número de cópias gera uma página por cópia).
3. Depois de imprimir, café, peso, moagem e data são mantidos; só o cliente é limpo.
4. Aviso importante: o navegador não informa se a impressora realmente imprimiu. "Enviadas para impressão" significa que o pedido foi entregue ao Windows. Se nada sair, veja a fila de impressão do Windows (impressora desligada, sem papel, offline).

## Cafés, selo e cópia de segurança

- Aba **Cafés**: adicionar, editar, remover ou **desativar** (some da lista de emissão, mas não é apagado). Já vem cadastrado o *Arara da Mogiana*.
- Em **Configurações**: liga/desliga o selo "Cafés Especiais / Torra Local" ao fundo, orientação da impressão e **Modo sem impressora** (baixa o rótulo como imagem PNG).
- **Cópia de segurança:** os cafés e configurações ficam guardados **neste navegador, neste computador**. Se os dados de navegação forem apagados, eles somem. Em Configurações há **Baixar cópia de segurança** e **Restaurar de uma cópia**. Faça uma cópia de vez em quando e antes de trocar de computador.

---

## Para desenvolvedores

```
npm install        # dependências
npm test           # compila (servidor e site) e roda os testes
npm run site       # gera site/ e abre em http://localhost:8080
npm run build:site # só gera site/ (pasta pronta para qualquer hospedagem estática)
```

- `src/core/label/draw.ts` – desenho do rótulo, **compartilhado** pelo servidor (Node) e pelo navegador. Cada ambiente injeta seu canvas e suas fontes.
- `src/web/` – app do navegador: `app.ts` (telas), `env.ts` (canvas/fontes), `print.ts` (impressão pelo navegador), `storage.ts` (cadastro, configurações e backup, atrás da interface `Repository`), `request.ts` (validação).
- `site-src/` – HTML, CSS, manifesto e service worker; `scripts/build-site.mjs` monta a pasta `site/`.
- `.github/workflows/site.yml` – publica `site/` no GitHub Pages (precisa habilitar Pages com origem "GitHub Actions" e do plano do repositório).
- A interface `Repository` permite trocar o armazenamento do navegador por um serviço na nuvem no futuro, sem mexer no resto.
- Fora do escopo desta versão: login, histórico de impressões, ERP, importação em lote.
