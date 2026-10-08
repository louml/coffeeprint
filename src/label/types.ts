/** Café cadastrado (parte fixa do rótulo). */
export interface Cafe {
  id: string;
  nome: string;
  notas: string;
  produtor: string;
  /** Como o campo aparece no rótulo: "Produtor" (padrão), "Produtora"... */
  rotuloProdutor?: string;
  variedade: string;
  regiao: string;
  especie: string;
  torra: string;
  ativo: boolean;
}

/** Tudo o que é necessário para desenhar um rótulo. */
export interface DadosRotulo {
  cafe: Omit<Cafe, 'id' | 'ativo'>;
  cliente: string;
  peso: string;
  moagem: string;
  /** Texto já formatado, ex.: 05/10/2026 */
  dataTorra: string;
}

/** Imagem 1 bit por pixel, linhas empacotadas, bit 1 = ponto preto, MSB primeiro. */
export interface Bitmap1bpp {
  width: number;
  height: number;
  bytesPerRow: number;
  data: Uint8Array;
}

export interface OpcoesRotulo {
  selo: boolean;
}
