/*
 * Catálogo padrão (tabela de revenda DuJOÃO).
 *
 * Depois que a planilha estiver ligada, os preços e a disponibilidade
 * passam a vir da aba "Produtos" da planilha. Este arquivo continua
 * servindo para as fotos e como reserva caso a planilha não responda.
 */
window.CATALOGO_DUJOAO = {
  categorias: [
    { id: 'prontos', nome: 'Prontos para consumo', nota: 'Embalados e prontos para comer.' },
    { id: 'linguicas', nome: 'Linguiças suínas', nota: 'Pacotes de 500 g.', conservacao: 'Congelado' },
    {
      id: 'vulcao',
      nome: 'Linguiça Vulcão',
      nota: 'Linguiça toscana enrolada com bacon e recheada. Pacote com 4 unidades, cerca de 1 kg.',
      conservacao: 'Congelado'
    },
    { id: 'congelados', nome: 'Congelados', conservacao: 'Congelado' },
    { id: 'resfriados', nome: 'Resfriados', conservacao: 'Resfriado' }
  ],

  produtos: [
    { id: 'torresmo-180', cat: 'prontos', nome: 'Torresmo 180 g', detalhe: 'Torresmos Premium, pote', preco: 28.00, foto: 'assets/img/torresmo-180.webp', fotoGrande: 'assets/img/torresmo-180-g.webp' },
    { id: 'torresmo-60', cat: 'prontos', nome: 'Torresmo 60 g', detalhe: 'Torresmos Premium', preco: 13.00 },
    { id: 'pururuca-135', cat: 'prontos', nome: 'Pururuca 135 g', detalhe: 'Pururuca tradicional', preco: 15.00, foto: 'assets/img/pururuca.webp', fotoGrande: 'assets/img/pururuca-g.webp' },
    { id: 'farofa-160', cat: 'prontos', nome: 'Farofa de mandioca com torresmo 160 g', preco: 8.00 },
    { id: 'farofa-450', cat: 'prontos', nome: 'Farofa de mandioca com torresmo 450 g', preco: 20.00 },

    { id: 'linguica-toscana', cat: 'linguicas', nome: 'Linguiça Toscana 500 g', curto: 'Toscana', preco: 17.00 },
    { id: 'linguica-caipira', cat: 'linguicas', nome: 'Linguiça Tipo caipira 500 g', curto: 'Tipo caipira', preco: 17.00 },
    { id: 'linguica-apimentada', cat: 'linguicas', nome: 'Linguiça Apimentada 500 g', curto: 'Apimentada', preco: 18.00 },
    { id: 'linguica-queijo-coalho', cat: 'linguicas', nome: 'Linguiça Queijo coalho e pimenta biquinho 500 g', curto: 'Queijo coalho e pimenta biquinho', preco: 20.00 },

    { id: 'vulcao-3-queijos', cat: 'vulcao', nome: 'Linguiça Vulcão 3 Queijos', curto: '3 Queijos', selo: '4 un', detalhe: 'Mussarela, catupiry original e parmesão', preco: 49.90 },
    { id: 'vulcao-cheddar', cat: 'vulcao', nome: 'Linguiça Vulcão Cheddar', curto: 'Cheddar', selo: '4 un', detalhe: 'Cheddar, azeitona, pimenta biquinho e queijo coalho', preco: 49.90 },
    { id: 'vulcao-nozes', cat: 'vulcao', nome: 'Linguiça Vulcão Nozes', curto: 'Nozes', selo: '4 un', detalhe: 'Cream cheese, nozes e provolone', preco: 49.90 },
    { id: 'vulcao-romeu-julieta', cat: 'vulcao', nome: 'Linguiça Vulcão Romeu e Julieta', curto: 'Romeu e Julieta', selo: '4 un', detalhe: 'Mussarela, parmesão e goiabada', preco: 49.90 },

    { id: 'porchetta-400', cat: 'congelados', nome: 'Porchetta 400 g', curto: 'Porchetta', detalhe: 'Peça com 400 g (R$ 75,00 o kg)', preco: 30.00, foto: 'assets/img/porchetta.webp', fotoGrande: 'assets/img/porchetta-g.webp' },
    { id: 'hamburguer-provolone', cat: 'congelados', nome: 'Hambúrguer suíno recheado com provolone 600 g', curto: 'Hambúrguer suíno recheado com provolone', detalhe: '600 g, 3 unidades', preco: 22.00 },
    { id: 'codeguim-500', cat: 'congelados', nome: 'Codeguim 500 g', preco: 17.00 },
    { id: 'joelho-porco', cat: 'congelados', nome: 'Joelho de porco semi-pronto', detalhe: 'Cobrado pelo peso da peça', preco: 39.90, unidade: 'kg' },

    { id: 'banha-950', cat: 'resfriados', nome: 'Banha 950 g', preco: 25.00 },
    { id: 'banha-400', cat: 'resfriados', nome: 'Banha 400 g', preco: 15.00 }
  ]
};
