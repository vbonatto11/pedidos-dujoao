/*
 * Configurações do site de pedidos DuJOÃO.
 *
 * urlPlanilha: cole aqui a URL do Apps Script (termina em /exec).
 *              Enquanto estiver vazia, o site envia o pedido pelo WhatsApp.
 */
window.CONFIG_DUJOAO = {
  urlPlanilha: 'https://script.google.com/macros/s/AKfycbxw8eWOx5quYTkJSlMcGReWT_nGoa__97Lw48-krXo3f-9bTRco_a3On5eSELCH2zKx/exec',

  // Número com DDI + DDD, só dígitos. Usado no botão "Avisar no WhatsApp".
  whatsapp: '5535998983305',

  // Quem organiza os pedidos (aparece no rodapé e nas mensagens).
  responsavel: 'Vinicius',

  // Pagamento mostrado na confirmação do pedido.
  pix: {
    chave: '(19) 99752-1066',
    tipo: 'celular',
    nome: 'João Bonatto',
    quando: 'Faça o PIX depois de receber os produtos.'
  },

  instagram: 'torresminhosdujoao'
};
