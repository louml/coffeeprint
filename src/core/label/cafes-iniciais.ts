import type { Cafe } from './types.js';

/**
 * Cafés que já vêm cadastrados. `desde` é a versão da lista em que o café entrou:
 * quem já usava o app recebe só os que entraram depois (sem recriar um café que apagou).
 * Para acrescentar cafés no futuro: coloque no fim com `desde` = SEED_VERSION + 1 e aumente SEED_VERSION.
 */
export const SEED_VERSION = 4;

export type CafeInicial = Cafe & { desde: number };

const base = { especie: '100% Arábica', torra: 'Torra média', ativo: true };
const blendNotas = 'Calda de pudim, açúcar mascavo, frutas amarelas e frutas vermelhas';

export const CAFES_INICIAIS: CafeInicial[] = [
  { id: 'arara-da-mogiana', desde: 1, nome: 'Arara da Mogiana', notas: 'Ameixa e caramelo', produtor: 'Luís Sordi', variedade: 'Arara', regiao: 'Média Mogiana', ...base },
  // Nos blends, as variedades e os produtores estão na mesma ordem (o 1º produtor é da 1ª variedade).
  { id: 'blend-imperador', desde: 2, nome: 'Blend Imperador', notas: blendNotas, produtor: 'Mauro Riccetto e Marcos Riccetto', variedade: 'Catuaí Amarelo e Catuaí da Mogiana', regiao: 'Média Mogiana', ...base },
  { id: 'blend-dois-catuais', desde: 2, nome: 'Blend Dois Catuaís', notas: blendNotas, produtor: 'Irmãos Riccetto e Mauro Riccetto', variedade: 'Catuaí Vermelho e Catuaí Amarelo', regiao: 'Média Mogiana', ...base },
  { id: 'bourbon-vermelho', desde: 2, nome: 'Bourbon Vermelho', notas: 'Melado e frutas silvestres', produtor: 'Sandra Momoeda', variedade: 'Bourbon', regiao: 'Serra da Mantiqueira', ...base },
  { id: 'campeao', desde: 2, nome: 'Campeão', notas: 'Melado e chocolate', produtor: 'Marcelo Urtado', variedade: 'Topázio', regiao: 'Cerrado Mineiro', ...base },
  // versão 3
  { id: 'catuai-da-mogiana', desde: 3, nome: 'Catuaí da Mogiana', notas: 'Chocolate amargo e damasco', produtor: 'Irmãos Riccetto', variedade: 'Catuaí amarelo', regiao: 'Média Mogiana', ...base },
  { id: 'catucai', desde: 3, nome: 'Catucaí', notas: 'Caramelo e maracujá', produtor: 'Sandra Momoeda', variedade: 'Catucaí amarelo', regiao: 'Serra da Mantiqueira', ...base },
  { id: 'doce-cerrado', desde: 3, nome: 'Doce Cerrado', notas: 'Melado e amêndoas', produtor: 'Marcelo Urtado', variedade: 'Topázio', regiao: 'Cerrado Mineiro', ...base },
  // mesmo título do anterior, só muda o nível de torra
  { id: 'doce-cerrado-media-clara', desde: 3, nome: 'Doce Cerrado', notas: 'Melado e amêndoas', produtor: 'Marcelo Urtado', variedade: 'Topázio', regiao: 'Cerrado Mineiro', ...base, torra: 'Torra média clara' },
  { id: 'fermentado-cacau', desde: 3, nome: 'Fermentado Cacau', notas: 'Nibs de cacau e anis', produtor: 'Fazenda Lagoinha', variedade: 'Catuaí amarelo', regiao: 'Sul de Minas', ...base },
  // versão 4
  { id: 'moca-arara', desde: 4, nome: 'Moca Arara', notas: 'Bergamota e caramelo', produtor: 'Luís Sordi', variedade: 'Arara, Tipo Moca', regiao: 'Média Mogiana', ...base },
  { id: 'mundo-novo', desde: 4, nome: 'Mundo Novo', notas: 'Caramelo e cereais', produtor: 'Irmãos Riccetto', variedade: 'Mundo Novo', regiao: 'Média Mogiana', ...base },
  { id: 'paulista-amarelo', desde: 4, nome: 'Paulista Amarelo', notas: 'Calda de pudim e frutas vermelhas', produtor: 'Irmãos Riccetto', variedade: 'Catuaí amarelo', regiao: 'Média Mogiana', ...base },
  { id: 'fermentado-framboesa', desde: 4, nome: 'Fermentado Framboesa', notas: 'Whisky e framboesa', produtor: 'Fazenda Lagoinha', variedade: 'Catuaí amarelo', regiao: 'Sul de Minas', ...base },
  // no rótulo deste café o campo se chama "Produtora"
  { id: 'geisha', desde: 4, nome: 'Geisha', notas: 'Flor de laranjeira e mel', produtor: 'Daniela Bertolin', rotuloProdutor: 'Produtora', variedade: 'Geisha', regiao: 'Média Mogiana', ...base },
];

/** Cafés iniciais sem o campo interno `desde`. */
export const semDesde = (c: CafeInicial): Cafe => {
  const { desde: _desde, ...cafe } = c;
  return cafe;
};
