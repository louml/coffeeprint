-- Cafés iniciais do app (gerado por scripts/gerar-seed.mjs; não edite à mão).
insert into public.cafes (legacy_id, nome, notas, produtor, rotulo_produtor, variedade, regiao, especie, torra, ativo)
values
  ('arara-da-mogiana', 'Arara da Mogiana', 'Ameixa e caramelo', 'Luís Sordi', '', 'Arara', 'Média Mogiana', '100% Arábica', 'Torra média', true),
  ('blend-imperador', 'Blend Imperador', 'Calda de pudim, açúcar mascavo, frutas amarelas e frutas vermelhas', 'Mauro Riccetto e Marcos Riccetto', '', 'Catuaí Amarelo e Catuaí da Mogiana', 'Média Mogiana', '100% Arábica', 'Torra média', true),
  ('blend-dois-catuais', 'Blend Dois Catuaís', 'Calda de pudim, açúcar mascavo, frutas amarelas e frutas vermelhas', 'Irmãos Riccetto e Mauro Riccetto', '', 'Catuaí Vermelho e Catuaí Amarelo', 'Média Mogiana', '100% Arábica', 'Torra média', true),
  ('bourbon-vermelho', 'Bourbon Vermelho', 'Melado e frutas silvestres', 'Sandra Momoeda', '', 'Bourbon', 'Serra da Mantiqueira', '100% Arábica', 'Torra média', true),
  ('campeao', 'Campeão', 'Melado e chocolate', 'Marcelo Urtado', '', 'Topázio', 'Cerrado Mineiro', '100% Arábica', 'Torra média', true),
  ('catuai-da-mogiana', 'Catuaí da Mogiana', 'Chocolate amargo e damasco', 'Irmãos Riccetto', '', 'Catuaí amarelo', 'Média Mogiana', '100% Arábica', 'Torra média', true),
  ('catucai', 'Catucaí', 'Caramelo e maracujá', 'Sandra Momoeda', '', 'Catucaí amarelo', 'Serra da Mantiqueira', '100% Arábica', 'Torra média', true),
  ('doce-cerrado', 'Doce Cerrado', 'Melado e amêndoas', 'Marcelo Urtado', '', 'Topázio', 'Cerrado Mineiro', '100% Arábica', 'Torra média', true),
  ('doce-cerrado-media-clara', 'Doce Cerrado', 'Melado e amêndoas', 'Marcelo Urtado', '', 'Topázio', 'Cerrado Mineiro', '100% Arábica', 'Torra média clara', true),
  ('fermentado-cacau', 'Fermentado Cacau', 'Nibs de cacau e anis', 'Fazenda Lagoinha', '', 'Catuaí amarelo', 'Sul de Minas', '100% Arábica', 'Torra média', true),
  ('moca-arara', 'Moca Arara', 'Bergamota e caramelo', 'Luís Sordi', '', 'Arara, Tipo Moca', 'Média Mogiana', '100% Arábica', 'Torra média', true),
  ('mundo-novo', 'Mundo Novo', 'Caramelo e cereais', 'Irmãos Riccetto', '', 'Mundo Novo', 'Média Mogiana', '100% Arábica', 'Torra média', true),
  ('paulista-amarelo', 'Paulista Amarelo', 'Calda de pudim e frutas vermelhas', 'Irmãos Riccetto', '', 'Catuaí amarelo', 'Média Mogiana', '100% Arábica', 'Torra média', true),
  ('fermentado-framboesa', 'Fermentado Framboesa', 'Whisky e framboesa', 'Fazenda Lagoinha', '', 'Catuaí amarelo', 'Sul de Minas', '100% Arábica', 'Torra média', true),
  ('geisha', 'Geisha', 'Flor de laranjeira e mel', 'Daniela Bertolin', 'Produtora', 'Geisha', 'Média Mogiana', '100% Arábica', 'Torra média', true),
  ('laurina', 'Laurina', 'Mel e frutas amarelas', 'Fazenda São Gabriel', '', 'Laurina', 'Sul de Minas', '100% Arábica', 'Torra média', true),
  ('paulista-vermelho', 'Paulista Vermelho', 'Açúcar mascavo e frutas amarelas', 'Irmãos Riccetto', '', 'Catuaí vermelho', 'Média Mogiana', '100% Arábica', 'Torra média', true),
  ('topazio-fermentado', 'Topázio Fermentado', 'Limão cravo e especiarias', 'Marcelo Urtado', '', 'Topázio', 'Cerrado Mineiro', '100% Arábica', 'Torra média', true),
  ('topazio', 'Topázio', 'Baunilha, abacaxi, mel e laranja', 'Marcelo Urtado', '', 'Topázio', 'Cerrado Mineiro', '100% Arábica', 'Torra média', true)
on conflict (legacy_id) do nothing;
