import { formatDate } from './label/format.js';
import type { DadosRotulo } from './label/types.js';
import { dadosDoPedido, type Pedido } from './request.js';
import { newId, type Repository } from './storage.js';

/** Máximo de etiquetas na fila (soma das cópias), para a impressão não ficar pesada demais. */
export const LIMITE_ETIQUETAS = 500;

export interface ItemFila {
  id: string;
  /** Café escolhido no formulário (usado por "Editar"). */
  cafeId: string;
  /** Cópia dos dados do café no momento em que entrou na fila: o rótulo sai exatamente como foi visto. */
  cafe: DadosRotulo['cafe'];
  cliente: string;
  peso: string;
  moagem: string;
  /** Tag de entrega ("" = sem tag). Itens guardados por versões antigas não têm este campo. */
  entrega?: string;
  /** AAAA-MM-DD */
  dataTorra: string;
  copias: number;
  /** Já foi mandado para impressão (continua na lista até o usuário limpar). */
  enviado?: boolean;
}

/** Dados prontos para desenhar o rótulo deste item. */
export function dadosDoItem(item: ItemFila): DadosRotulo {
  return { cafe: item.cafe, cliente: item.cliente, peso: item.peso, moagem: item.moagem, entrega: item.entrega ?? '', dataTorra: formatDate(item.dataTorra) };
}

export const totalEtiquetas = (fila: ItemFila[]): number => fila.reduce((soma, i) => soma + i.copias, 0);

/** Fila de rótulos para imprimir de uma vez. Guardada no Repository, então sobrevive a recarregar a página. */
export class FilaDeImpressao {
  constructor(private readonly repo: Repository) {}

  list(): ItemFila[] {
    return this.repo.getFila();
  }

  total(): number {
    return totalEtiquetas(this.list());
  }

  /** Acrescenta o rótulo do formulário (já validado) ao fim da fila. */
  adicionar(p: Pedido): ItemFila {
    const dados = dadosDoPedido(p);
    if (!dados || !p.cafe) throw new Error('Escolha um café.');
    if (!Number.isInteger(p.copias) || p.copias < 1) throw new Error('O número de cópias deve ser um inteiro a partir de 1.');
    let fila = this.list();
    // se tudo o que estava na fila já foi enviado, começa uma fila nova
    if (fila.length && fila.every((i) => i.enviado)) fila = [];
    const total = totalEtiquetas(fila);
    if (total + p.copias > LIMITE_ETIQUETAS) {
      throw new Error(`A fila não pode passar de ${LIMITE_ETIQUETAS} etiquetas (hoje tem ${total}). Imprima a fila e comece outra.`);
    }
    const item: ItemFila = { id: newId(), cafeId: p.cafe.id, cafe: dados.cafe, cliente: dados.cliente, peso: dados.peso, moagem: dados.moagem, entrega: p.entrega, dataTorra: p.dataTorra, copias: p.copias };
    this.repo.saveFila([...fila, item]);
    return item;
  }

  /** Tira um item da fila e o devolve (para "Remover" ou "Editar"). */
  remover(id: string): ItemFila | undefined {
    const fila = this.list();
    const item = fila.find((i) => i.id === id);
    if (item) this.repo.saveFila(fila.filter((i) => i.id !== id));
    return item;
  }

  /** Muda o número de cópias de um item (mínimo 1; respeita o limite da fila). Devolve o valor aplicado. */
  alterarCopias(id: string, copias: number): number | undefined {
    const fila = this.list();
    const item = fila.find((i) => i.id === id);
    if (!item) return undefined;
    const maximo = LIMITE_ETIQUETAS - (totalEtiquetas(fila) - item.copias);
    item.copias = Math.max(1, Math.min(Math.trunc(copias) || 1, maximo));
    this.repo.saveFila(fila);
    return item.copias;
  }

  limpar(): void {
    this.repo.saveFila([]);
  }

  marcarEnviadas(): void {
    this.repo.saveFila(this.list().map((i) => ({ ...i, enviado: true })));
  }
}
