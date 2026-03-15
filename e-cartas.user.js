// ==UserScript==
// @name         PJe TJCE - Certidões E-Carta + Correios + Monitor
// @namespace    https://pje.tjce.jus.br/
// @version      1.7.0
// @description  Certidões E-Carta por linha, integração com Correios e atalho para Monitor E-Carta por processo.
// @match        https://pje.tjce.jus.br/pje1grau/ECarta/detalhe/listView.seam*
// @match        https://pje.tjce.jus.br/pje1grau/ECarta/monitor.seam*
// @match        https://pje.tjce.jus.br/pje1grau/Processo/ConsultaProcesso/Detalhe/listAutosDigitais.seam*
// @match        https://rastreamento.correios.com.br/*
// @grant        GM_setClipboard
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  const DEBUG = false;

  const APP = {
    pjeOrigin: 'https://pje.tjce.jus.br',
    correiosOrigin: 'https://rastreamento.correios.com.br',
    messageType: 'PJE_ECARTA_CORREIOS_TRACKING',
    paths: {
      detalheEcarta: '/pje1grau/ECarta/detalhe/listView.seam',
      monitorEcarta: '/pje1grau/ECarta/monitor.seam',
      autosDigitais: '/pje1grau/Processo/ConsultaProcesso/Detalhe/listAutosDigitais.seam'
    },
    storage: {
      tracking: 'pjeEcartaCorreiosTracking',
      pendingCode: 'pjeEcartaPendingCode',
      pendingMonitorProcess: 'pjeEcartaPendingMonitorProcess',
      monitorAutofillDone: 'pjeEcartaMonitorAutofillDone'
    }
  };

  function debugLog(...args) {
    if (DEBUG) console.log(...args);
  }

  function isCorreiosPage() {
    return location.hostname === 'rastreamento.correios.com.br';
  }

  function isPJePage() {
    return location.hostname === 'pje.tjce.jus.br';
  }

  function isEcartaDetalhePage() {
    return isPJePage() && location.pathname.includes(APP.paths.detalheEcarta);
  }

  function isEcartaMonitorPage() {
    return isPJePage() && location.pathname.includes(APP.paths.monitorEcarta);
  }

  function isAutosDigitaisPage() {
    return isPJePage() && location.pathname.includes(APP.paths.autosDigitais);
  }

  const Shared = {
    normalizeSpaces(text) {
      return String(text || '').replace(/\s+/g, ' ').trim();
    },

    normalizeText(text) {
      return Shared.normalizeSpaces(text)
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase();
    },

    escapeHtml(value) {
      return String(value || '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
    },

    escapeAttr(value) {
      return Shared.escapeHtml(value);
    },

    isValidPostalCode(value) {
      return /^[A-Z]{2}\d{9}BR$/i.test(Shared.normalizeSpaces(value).toUpperCase());
    },

    isNaoDisponivelText(value) {
      return Shared.normalizeText(value) === 'nao disponivel';
    },

    formatDateForCertidao(value) {
      if (!value) return '';
      const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (!match) return value;
      return `${match[3]}/${match[2]}/${match[1]}`;
    },

    extractIsoDate(value) {
      const match = String(value || '').match(/(\d{2})\/(\d{2})\/(\d{4})/);
      if (!match) return '';
      return `${match[3]}-${match[2]}-${match[1]}`;
    },

    getTrackingStore() {
      try {
        return JSON.parse(sessionStorage.getItem(APP.storage.tracking) || '{}');
      } catch {
        return {};
      }
    },

    saveTrackingPayload(payload) {
      if (!payload?.codigo) return;
      const store = Shared.getTrackingStore();
      store[payload.codigo] = payload;
      sessionStorage.setItem(APP.storage.tracking, JSON.stringify(store));
    },

    getTrackingPayload(codigo) {
      if (!codigo) return null;
      const store = Shared.getTrackingStore();
      return store[codigo] || null;
    },

    removeCertidaoTitle(text) {
      const lines = String(text || '').split('\n');
      if (!lines.length) return '';

      while (lines.length && !Shared.normalizeSpaces(lines[0])) {
        lines.shift();
      }

      if (lines.length && Shared.normalizeText(lines[0]).startsWith('certidao')) {
        lines.shift();
      }

      while (lines.length && !Shared.normalizeSpaces(lines[0])) {
        lines.shift();
      }

      return lines.join('\n');
    },

    async copyTextToClipboard(text) {
      const safeText = String(text || '');

      if (typeof GM_setClipboard === 'function') {
        try {
          GM_setClipboard(safeText, 'text');
          return { ok: true, method: 'GM_setClipboard' };
        } catch (_) {}
      }

      if (navigator.clipboard && window.isSecureContext) {
        try {
          await navigator.clipboard.writeText(safeText);
          return { ok: true, method: 'navigator.clipboard' };
        } catch (_) {}
      }

      const textarea = document.createElement('textarea');
      textarea.value = safeText;
      textarea.setAttribute('readonly', 'readonly');
      textarea.style.position = 'fixed';
      textarea.style.left = '20px';
      textarea.style.top = '20px';
      textarea.style.width = '1px';
      textarea.style.height = '1px';
      textarea.style.opacity = '0.01';

      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      textarea.setSelectionRange(0, textarea.value.length);

      let success = false;
      try {
        success = document.execCommand('copy');
      } finally {
        document.body.removeChild(textarea);
      }

      if (success) return { ok: true, method: 'execCommand' };
      throw new Error('Todos os métodos de cópia falharam.');
    },

    showToast(message) {
      let toast = document.querySelector('.pje-ecarta-toast');
      if (!toast) {
        toast = document.createElement('div');
        toast.className = 'pje-ecarta-toast';
        document.body.appendChild(toast);
      }

      toast.textContent = message;
      toast.classList.add('show');

      clearTimeout(Shared._toastTimer);
      Shared._toastTimer = setTimeout(() => {
        toast.classList.remove('show');
      }, 3200);
    },

    injectGlobalStyles() {
      if (document.getElementById('pje-ecarta-global-style')) return;

      const style = document.createElement('style');
      style.id = 'pje-ecarta-global-style';
      style.textContent = `
        .pje-ecarta-toast {
          position: fixed;
          right: 20px;
          bottom: 20px;
          z-index: 1000000;
          background: #111827;
          color: #fff;
          padding: 10px 14px;
          border-radius: 8px;
          box-shadow: 0 8px 20px rgba(0,0,0,0.25);
          font-size: 12px;
          opacity: 0;
          transform: translateY(8px);
          transition: all .18s ease;
          max-width: 460px;
          font-family: Arial, sans-serif;
        }

        .pje-ecarta-toast.show {
          opacity: 1;
          transform: translateY(0);
        }

        .pje-monitor-correios-link {
          cursor: pointer;
          margin-left: 6px;
          user-select: none;
          display: inline-flex;
          align-items: center;
          vertical-align: middle;
          color: inherit;
          opacity: .85;
        }

        .pje-monitor-correios-link:hover {
          opacity: 1;
        }

        .pje-monitor-correios-inline {
          display: inline-flex;
          align-items: center;
        }
      `;
      document.head.appendChild(style);
    },

    getProcessNumberFromTop() {
      const anchor = document.querySelector('a.titulo-topo.dropdown-toggle.titulo-topo-desktop');
      const text = Shared.normalizeSpaces(anchor?.textContent || document.body?.innerText || '');
      const match = text.match(/\b\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}\b/);
      return match ? match[0] : '';
    }
  };

  const Templates = {
    getSemJuntadaArFisicoParagrafo() {
      return 'Em razão de falhas operacionais no sistema E-Carta, não houve a juntada automática do Aviso de Recebimento (A.R.) físico aos autos. Esta Secretaria não dispõe de meios técnicos que permitam realizar a recuperação ou juntada direta do referido documento por meio do sistema.';
    },

    getCertidaoLabel(certidaoType) {
      const labels = {
        ERRO_ENVIO_COM_MOTIVO: 'CERTIDÃO - FALHA NO E-CARTA',
        FALHA_SERVICO_ECARTA: 'CERTIDÃO - FALHA NO E-CARTA',
        AR_NAO_JUNTADO: 'CERTIDÃO - AUSÊNCIA DE JUNTADA DE A.R.',
        CORREIOS_ENTREGUE: 'CERTIDÃO - A.R. ENTREGUE',
        CORREIOS_PENDENTE: 'CERTIDÃO - A.R. NÃO DEVOLVIDO',
        CORREIOS_TENTATIVA_FRUSTRADA: 'CERTIDÃO - TENTATIVA DE ENTREGA FRUSTRADA',
        CORREIOS_AGUARDANDO_RETIRADA: 'CERTIDÃO - OBJETO AGUARDANDO RETIRADA',
        CORREIOS_DEVOLVIDO: 'CERTIDÃO - OBJETO DEVOLVIDO',
        CORREIOS_NAO_CONSULTADO: 'CERTIDÃO - CONSULTA NÃO CONCLUÍDA'
      };
      return labels[certidaoType] || 'CERTIDÃO';
    },

    getConteudoCertidao({ certidaoType, safeIdEnvio, safeDataEnvio, safeMensagem, safeCodigo, safeDataEntrega, safeStatus }) {
      switch (certidaoType) {
        case 'ERRO_ENVIO_COM_MOTIVO':
          return {
            cabecalho: `Certifico que, em consulta ao sistema E-Carta, verifiquei que o expediente de ID Envio ${safeIdEnvio}, encaminhado em ${safeDataEnvio}, não gerou objeto postal junto aos Correios, constando no retorno do sistema a seguinte mensagem: "${safeMensagem}".`,
            complemento: 'Em razão disso, não foi possível realizar o rastreamento do Aviso de Recebimento.'
          };
        case 'FALHA_SERVICO_ECARTA':
          return {
            cabecalho: `Certifico que realizei consulta ao sistema E-Carta para verificação da situação do expediente de ID Envio ${safeIdEnvio}, encaminhado em ${safeDataEnvio}.`,
            complemento: 'Contudo, o sistema retornou a informação de que não foi possível recuperar dados atualizados no serviço E-Carta, razão pela qual não foi possível obter informações atualizadas acerca do objeto postal ou do respectivo Aviso de Recebimento.'
          };
        case 'AR_NAO_JUNTADO':
          return {
            cabecalho: `Certifico que, embora haja registro de movimentação ou retorno relacionado ao expediente de ID Envio ${safeIdEnvio}, não foi disponibilizado automaticamente nos autos o respectivo Aviso de Recebimento, não dispondo esta Secretaria, neste momento, de ferramenta que permita resgatar diretamente o documento pelo sistema E-Carta.`,
            complemento: ''
          };
        case 'CORREIOS_ENTREGUE':
          return {
            cabecalho: `Certifico que, em consulta ao sistema de rastreamento dos Correios, referente ao objeto postal nº ${safeCodigo}, verifiquei que o objeto foi entregue ao destinatário em ${safeDataEntrega}.`,
            complemento: ''
          };
        case 'CORREIOS_PENDENTE':
          return {
            cabecalho: `Certifico que, em consulta ao sistema de rastreamento dos Correios, referente ao objeto postal nº ${safeCodigo}, verifiquei que, até o presente momento, não há confirmação de retorno do Aviso de Recebimento, constando a situação "${safeStatus}".`,
            complemento: ''
          };
        case 'CORREIOS_TENTATIVA_FRUSTRADA':
          return {
            cabecalho: `Certifico que, em consulta ao sistema de rastreamento dos Correios, referente ao objeto postal nº ${safeCodigo}, verifiquei a ocorrência de tentativa de entrega não efetuada, constando a situação "${safeStatus}".`,
            complemento: ''
          };
        case 'CORREIOS_AGUARDANDO_RETIRADA':
          return {
            cabecalho: `Certifico que, em consulta ao sistema de rastreamento dos Correios, referente ao objeto postal nº ${safeCodigo}, verifiquei que o objeto encontra-se aguardando retirada em agência, constando a situação "${safeStatus}".`,
            complemento: ''
          };
        case 'CORREIOS_DEVOLVIDO':
          return {
            cabecalho: `Certifico que, em consulta ao sistema de rastreamento dos Correios, referente ao objeto postal nº ${safeCodigo}, verifiquei que o objeto foi devolvido, constando a situação "${safeStatus}".`,
            complemento: ''
          };
        case 'CORREIOS_NAO_CONSULTADO':
          return {
            cabecalho: `Certifico que o expediente possui objeto postal identificado sob o nº ${safeCodigo}. Contudo, não foi possível, nesta oportunidade, concluir a consulta ao respectivo rastreamento no sistema dos Correios.`,
            complemento: ''
          };
        default:
          return {
            cabecalho: `Certifico que consultei os dados do expediente de ID Envio ${safeIdEnvio}, encaminhado em ${safeDataEnvio}, não tendo sido possível enquadrar automaticamente a situação em um cenário específico.`,
            complemento: ''
          };
      }
    },

    buildCertidao({ pageData, certidaoType, idAutos, dataEntrega, statusDescricao, codigoObjetoPostal, incluirSemJuntadaArFisico }) {
      const safeIdAutos = Shared.normalizeSpaces(idAutos) || '[ID_AUTOS]';
      const safeIdEnvio = pageData.idEnvio || '[ID_ENVIO]';
      const safeDataEnvio = pageData.dataEnvio || '[DATA_ENVIO]';
      const safeMensagem = pageData.mensagemResposta || '[MENSAGEM]';
      const safeCodigo = Shared.normalizeSpaces(codigoObjetoPostal) || '[CODIGO]';
      const safeDataEntrega = Shared.formatDateForCertidao(dataEntrega) || '[DATA_ENTREGA]';
      const safeStatus = Shared.normalizeSpaces(statusDescricao) || '[STATUS_CORREIOS]';

      const conteudo = Templates.getConteudoCertidao({
        certidaoType,
        safeIdEnvio,
        safeDataEnvio,
        safeMensagem,
        safeCodigo,
        safeDataEntrega,
        safeStatus
      });

      const lines = [Templates.getCertidaoLabel(certidaoType), ''];

      if (incluirSemJuntadaArFisico) {
        lines.push(Templates.getSemJuntadaArFisicoParagrafo(), '');
      }

      lines.push(conteudo.cabecalho);

      if (conteudo.complemento) {
        lines.push('', conteudo.complemento);
      }

      lines.push(
        '',
        `O expediente correspondente à presente carta encontra-se vinculado ao ID ${safeIdAutos} nos autos.`,
        '',
        'O referido é verdade. Dou fé.'
      );

      return lines.join('\n');
    }
  };

  const PJeCertidoes = {
    config: {
      modalId: 'pje-ecarta-certidoes-modal',
      styleId: 'pje-ecarta-certidoes-style',
      observerFlag: 'ecartaCertTableEnhanced'
    },

    statusOptions: [
      { value: 'CORREIOS_ENTREGUE', label: 'Entregue' },
      { value: 'CORREIOS_PENDENTE', label: 'Em trânsito / aguardando retorno' },
      { value: 'CORREIOS_TENTATIVA_FRUSTRADA', label: 'Tentativa de entrega não efetuada' },
      { value: 'CORREIOS_AGUARDANDO_RETIRADA', label: 'Aguardando retirada em agência' },
      { value: 'CORREIOS_DEVOLVIDO', label: 'Objeto devolvido' },
      { value: 'CORREIOS_NAO_CONSULTADO', label: 'Não foi possível consultar' }
    ],

    currentModalApi: null,

    init() {
      PJeCertidoes.injectStyles();
      PJeCertidoes.observePage();
      PJeCertidoes.injectButtonsInSituacaoTable();
      PJeCertidoes.registerMessageBridge();
    },

    injectStyles() {
      if (document.getElementById(PJeCertidoes.config.styleId)) return;

      const style = document.createElement('style');
      style.id = PJeCertidoes.config.styleId;
      style.textContent = `
        #${PJeCertidoes.config.modalId}-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0,0,0,0.45);
          z-index: 999999;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
        }

        #${PJeCertidoes.config.modalId} {
          width: min(1020px, 96vw);
          max-height: 92vh;
          overflow: auto;
          background: #fff;
          border-radius: 10px;
          box-shadow: 0 12px 35px rgba(0,0,0,0.30);
          border: 1px solid #cfd6df;
          font-family: Arial, sans-serif;
        }

        #${PJeCertidoes.config.modalId} .ecarta-modal-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding: 14px 18px;
          border-bottom: 1px solid #e3e7ec;
          background: #f7f9fc;
          position: sticky;
          top: 0;
          z-index: 2;
        }

        #${PJeCertidoes.config.modalId} .ecarta-modal-title {
          font-size: 18px;
          font-weight: bold;
          color: #1b2a3a;
        }

        #${PJeCertidoes.config.modalId} .ecarta-modal-body {
          padding: 18px;
        }

        #${PJeCertidoes.config.modalId} .ecarta-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(240px, 1fr));
          gap: 14px;
          margin-bottom: 16px;
        }

        #${PJeCertidoes.config.modalId} .ecarta-field {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        #${PJeCertidoes.config.modalId} .ecarta-field.full {
          grid-column: 1 / -1;
        }

        #${PJeCertidoes.config.modalId} label {
          font-size: 12px;
          font-weight: bold;
          color: #334155;
        }

        #${PJeCertidoes.config.modalId} input[type="text"],
        #${PJeCertidoes.config.modalId} input[type="date"],
        #${PJeCertidoes.config.modalId} select,
        #${PJeCertidoes.config.modalId} textarea {
          width: 100%;
          box-sizing: border-box;
          border: 1px solid #c8d0da;
          border-radius: 6px;
          padding: 9px 10px;
          font-size: 13px;
          color: #1f2937;
          background: #fff;
        }

        #${PJeCertidoes.config.modalId} textarea {
          min-height: 280px;
          resize: none;
          line-height: 1.45;
        }

        #${PJeCertidoes.config.modalId} .ecarta-readonly {
          background: #f8fafc;
        }

        #${PJeCertidoes.config.modalId} .ecarta-certidao-readonly {
          background: #f8fafc;
          user-select: none;
          -webkit-user-select: none;
          -moz-user-select: none;
          -ms-user-select: none;
          cursor: default;
        }

        #${PJeCertidoes.config.modalId} .ecarta-placeholder {
          min-height: 280px;
          display: flex;
          align-items: center;
          justify-content: center;
          border: 1px dashed #cbd5e1;
          border-radius: 6px;
          background: #f8fafc;
          color: #64748b;
          font-size: 13px;
          padding: 18px;
          text-align: center;
          line-height: 1.5;
        }

        #${PJeCertidoes.config.modalId} .ecarta-hint {
          font-size: 11px;
          color: #64748b;
        }

        #${PJeCertidoes.config.modalId} .ecarta-pill {
          display: inline-flex;
          align-items: center;
          padding: 4px 8px;
          border-radius: 999px;
          background: #eef4ff;
          border: 1px solid #c9dafc;
          color: #1d4ed8;
          font-size: 11px;
          font-weight: bold;
        }

        #${PJeCertidoes.config.modalId} .ecarta-alert {
          margin-bottom: 14px;
          padding: 10px 12px;
          border-radius: 6px;
          border: 1px solid #f5d18a;
          background: #fff8e6;
          color: #7c5a0a;
          font-size: 12px;
        }

        #${PJeCertidoes.config.modalId} .ecarta-row-hidden {
          display: none !important;
        }

        #${PJeCertidoes.config.modalId} .ecarta-checkbox-wrap {
          display: flex;
          align-items: center;
          gap: 8px;
          padding-top: 2px;
          margin-top: 6px;
        }

        #${PJeCertidoes.config.modalId} .ecarta-checkbox-wrap label {
          font-size: 13px;
          font-weight: normal;
          color: #1f2937;
          margin: 0;
        }

        #${PJeCertidoes.config.modalId} .ecarta-modal-footer {
          display: flex;
          justify-content: flex-end;
          gap: 10px;
          padding: 14px 18px;
          border-top: 1px solid #e3e7ec;
          background: #fafbfd;
          position: sticky;
          bottom: 0;
          flex-wrap: wrap;
        }

        #${PJeCertidoes.config.modalId} .ecarta-btn {
          border: 1px solid #1d4ed8;
          background: #2563eb;
          color: #fff;
          border-radius: 6px;
          padding: 8px 12px;
          cursor: pointer;
          font-size: 12px;
          font-weight: bold;
        }

        #${PJeCertidoes.config.modalId} .ecarta-btn.secondary {
          background: #fff;
          color: #1f2937;
          border-color: #cbd5e1;
        }

        #${PJeCertidoes.config.modalId} .ecarta-btn.success {
          background: #ecfdf5;
          color: #166534;
          border-color: #86efac;
        }

        #${PJeCertidoes.config.modalId} .ecarta-btn.info {
          background: #eff6ff;
          color: #1d4ed8;
          border-color: #93c5fd;
        }

        .ecarta-action-th,
        .ecarta-action-td {
          text-align: center;
          vertical-align: middle;
          white-space: nowrap;
        }

        .ecarta-row-button {
          border: 1px solid #1d4ed8;
          background: #2563eb;
          color: #fff;
          border-radius: 4px;
          padding: 5px 9px;
          cursor: pointer;
          font-size: 11px;
          font-weight: bold;
        }
      `;
      document.head.appendChild(style);
    },

    observePage() {
      const observer = new MutationObserver(() => {
        PJeCertidoes.injectButtonsInSituacaoTable();
      });

      observer.observe(document.documentElement, {
        childList: true,
        subtree: true
      });
    },

    registerMessageBridge() {
      window.addEventListener('message', (event) => {
        if (event.origin !== APP.correiosOrigin) return;
        const data = event.data;
        if (!data || data.type !== APP.messageType) return;

        Shared.saveTrackingPayload(data.payload);
        Shared.showToast(`Dados do Correios recebidos para ${data.payload.codigo || 'código não identificado'}.`);

        if (PJeCertidoes.currentModalApi?.applyTrackingData) {
          PJeCertidoes.currentModalApi.applyTrackingData(data.payload);
        }
      });
    },

    findSituacaoAtualizadaTable() {
      const panelHeaders = [...document.querySelectorAll('.rich-panel-header')];
      const header = panelHeaders.find(el =>
        Shared.normalizeText(el.textContent).includes('e-carta - servico cnj - situacao atualizada')
      );
      if (!header) return null;

      const panel = header.closest('.rich-panel');
      if (!panel) return null;

      return panel.querySelector('table.rich-table');
    },

    getHeaderMap(table) {
      const ths = [...table.querySelectorAll('thead th')];
      return ths.map(th => Shared.normalizeText(th.textContent));
    },

    injectButtonsInSituacaoTable() {
      const table = PJeCertidoes.findSituacaoAtualizadaTable();
      if (!table) return;

      const theadRow = table.querySelector('thead tr');
      const tbodyRows = [...table.querySelectorAll('tbody tr')];
      if (!theadRow || !tbodyRows.length) return;

      if (!theadRow.querySelector('.ecarta-action-th')) {
        const th = document.createElement('th');
        th.className = 'rich-table-subheadercell ecarta-action-th';
        th.scope = 'col';
        th.textContent = 'Certidões';
        theadRow.appendChild(th);
      }

      const headers = PJeCertidoes.getHeaderMap(table);

      tbodyRows.forEach((row) => {
        if (row.querySelector('.ecarta-action-td')) return;

        const cells = [...row.querySelectorAll('td')];
        if (!cells.length) return;

        const rowData = PJeCertidoes.readSituacaoRow(headers, cells);
        const td = document.createElement('td');
        td.className = 'rich-table-cell ecarta-action-td';

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'ecarta-row-button';
        btn.textContent = 'Gerar Certidão';
        btn.addEventListener('click', () => {
          const pageData = PJeCertidoes.collectPageDataFromSituacaoRow(rowData);
          const classification = PJeCertidoes.classifyScenario(pageData);
          PJeCertidoes.renderModal(pageData, classification);
        });

        td.appendChild(btn);
        row.appendChild(td);
      });
    },

    readSituacaoRow(headers, cells) {
      const findIdx = (name) => headers.findIndex(h => h === name);

      const idxSituacao = findIdx('situacao');
      const idxDestinatario = findIdx('destinatario');
      const idxCodigoLocalizador = findIdx('codigo localizador');
      const idxEndDest = findIdx('end. destinatario');
      const idxRemetente = findIdx('remetente');
      const idxIdProcDoc = findIdx('id processo documento');
      const idxProcesso = findIdx('processo');
      const idxLote = findIdx('n. lote');
      const idxServicoAdicional = findIdx('servico adicional');
      const idxTipo = findIdx('tipo');

      const get = (idx) => idx >= 0 ? Shared.normalizeSpaces(cells[idx]?.textContent || '') : '';

      return {
        situacao: get(idxSituacao),
        destinatario: get(idxDestinatario),
        codigoLocalizador: get(idxCodigoLocalizador),
        enderecoDestinatario: get(idxEndDest),
        remetente: get(idxRemetente),
        idProcessoDocumento: get(idxIdProcDoc),
        processo: get(idxProcesso),
        lote: get(idxLote),
        servicoAdicional: get(idxServicoAdicional),
        tipo: get(idxTipo)
      };
    },

    collectPageDataFromSituacaoRow(rowData) {
      const codigo = rowData.codigoLocalizador || '';
      const trackingSalvo = Shared.isValidPostalCode(codigo) ? Shared.getTrackingPayload(codigo.toUpperCase()) : null;

      return {
        idEnvio: PJeCertidoes.extractIdEnvio(),
        dataEnvio: PJeCertidoes.extractDataEnvio(),
        idAutosCorrespondente: rowData.idProcessoDocumento || '',
        codigoObjetoPostalModal: codigo,
        mensagemResposta: rowData.situacao || '',
        updatedSituationText: rowData.situacao || '',
        codigoValido: Shared.isValidPostalCode(codigo),
        trackingSalvo,
        rowData
      };
    },

    extractIdEnvio() {
      const labelNodes = Array.from(document.querySelectorAll('#expedientesEnviadosViewView .propertyView'));
      for (const node of labelNodes) {
        const nameEl = node.querySelector('.name');
        const valueEl = node.querySelector('.value');
        if (!nameEl || !valueEl) continue;
        if (Shared.normalizeText(nameEl.textContent) === 'id.') {
          return Shared.normalizeSpaces(valueEl.textContent);
        }
      }

      const titleCell = document.querySelector('#pesquisar_lbl');
      const text = Shared.normalizeSpaces(titleCell?.textContent || '');
      const match = text.match(/ID Envio:\s*([0-9]+)/i);
      return match ? match[1] : '';
    },

    extractDataEnvio() {
      const labelNodes = Array.from(document.querySelectorAll('#expedientesEnviadosViewView .propertyView'));
      for (const node of labelNodes) {
        const nameEl = node.querySelector('.name');
        const valueEl = node.querySelector('.value');
        if (!nameEl || !valueEl) continue;
        if (Shared.normalizeText(nameEl.textContent) === 'data de envio') {
          return Shared.normalizeSpaces(valueEl.textContent);
        }
      }
      return '';
    },

    classifyScenario(pageData) {
      const situacao = Shared.normalizeText(pageData.rowData?.situacao || '');
      const messageText = Shared.normalizeSpaces(pageData.mensagemResposta);

      if (pageData.codigoValido) {
        return { code: 'CODIGO_VALIDO', label: 'Código válido localizado' };
      }

      if (situacao.includes('aguardando_retorno') || situacao.includes('aguardando retorno')) {
        return { code: 'AR_NAO_JUNTADO', label: 'Retorno ainda não consolidado' };
      }

      if (messageText && !Shared.isNaoDisponivelText(messageText)) {
        return { code: 'AR_NAO_JUNTADO', label: 'Situação sem código localizador válido' };
      }

      return { code: 'AR_NAO_JUNTADO', label: 'Retorno insuficiente / AR não juntado' };
    },

    resolveInitialCorreiosType(pageData, classification) {
      if (classification.code !== 'CODIGO_VALIDO') return classification.code;
      if (pageData.trackingSalvo) return PJeCertidoes.inferCorreiosCertType(pageData.trackingSalvo);
      return 'CORREIOS_ENTREGUE';
    },

    inferCorreiosCertType(payload) {
      const status = Shared.normalizeText(payload?.status || '');

      if (status.includes('entregue ao destinatario')) return 'CORREIOS_ENTREGUE';
      if (status.includes('nao entregue')) return 'CORREIOS_TENTATIVA_FRUSTRADA';
      if (status.includes('aguardando retirada')) return 'CORREIOS_AGUARDANDO_RETIRADA';
      if (status.includes('devolvido')) return 'CORREIOS_DEVOLVIDO';
      if (status) return 'CORREIOS_PENDENTE';
      return 'CORREIOS_NAO_CONSULTADO';
    },

    formatTrackingSummary(payload) {
      if (!payload) return '';
      const parts = [payload.codigo, payload.status, payload.local, payload.dataHora].filter(Boolean);
      return parts.join(' | ');
    },

    renderModal(pageData, classification) {
      PJeCertidoes.destroyModal();

      const overlay = document.createElement('div');
      overlay.id = `${PJeCertidoes.config.modalId}-overlay`;

      const modal = document.createElement('div');
      modal.id = PJeCertidoes.config.modalId;

      const trackingAvailable = Boolean(pageData.trackingSalvo);
      const initialCertType = PJeCertidoes.resolveInitialCorreiosType(pageData, classification);
      const initialDataEntrega = pageData.trackingSalvo?.dataEntregaISO || '';
      const initialStatusDescricao = pageData.trackingSalvo?.status || '';
      const hasImmediateCertidao = !pageData.codigoValido;

      const defaultText = hasImmediateCertidao
        ? Templates.buildCertidao({
            pageData,
            certidaoType: classification.code,
            idAutos: pageData.idAutosCorrespondente || pageData.rowData?.idProcessoDocumento || '',
            dataEntrega: '',
            statusDescricao: '',
            codigoObjetoPostal: pageData.codigoObjetoPostalModal,
            incluirSemJuntadaArFisico: false
          })
        : '';

      modal.innerHTML = `
        <div class="ecarta-modal-header">
          <div class="ecarta-modal-title">Gerar Certidão E-Carta</div>
          <span class="ecarta-pill">${Shared.escapeHtml(classification.label)}</span>
        </div>

        <div class="ecarta-modal-body">
          <div class="ecarta-alert">
            ${pageData.codigoValido
              ? 'Quando houver código localizador válido, a certidão só será liberada após a consulta aos Correios ou aplicação do retorno salvo.'
              : 'Como não há código localizador válido nesta linha, a certidão foi preparada com base na situação atualizada do CNJ.'}
          </div>

          <div class="ecarta-grid">
            <div class="ecarta-field">
              <label>ID Envio</label>
              <input type="text" class="ecarta-readonly" readonly value="${Shared.escapeAttr(pageData.idEnvio)}">
            </div>

            <div class="ecarta-field">
              <label>Data de envio</label>
              <input type="text" class="ecarta-readonly" readonly value="${Shared.escapeAttr(pageData.dataEnvio)}">
            </div>

            <div class="ecarta-field">
              <label>Situação</label>
              <input type="text" class="ecarta-readonly" readonly value="${Shared.escapeAttr(pageData.rowData?.situacao || '')}">
            </div>

            <div class="ecarta-field">
              <label>Tipo</label>
              <input type="text" class="ecarta-readonly" readonly value="${Shared.escapeAttr(pageData.rowData?.tipo || '')}">
            </div>

            <div class="ecarta-field full">
              <label>Destinatário</label>
              <input type="text" class="ecarta-readonly" readonly value="${Shared.escapeAttr(pageData.rowData?.destinatario || '')}">
            </div>

            <div class="ecarta-field full">
              <label>ID Processo Documento</label>
              <input type="text" id="ecarta-id-autos" value="${Shared.escapeAttr(pageData.idAutosCorrespondente || pageData.rowData?.idProcessoDocumento || '')}">
              <div class="ecarta-hint">Campo obrigatório para copiar a certidão.</div>
            </div>

            <div class="ecarta-field full">
              <label>Código Localizador / ID Objeto Postal</label>
              <input type="text" id="ecarta-id-objeto-postal-modal" value="${Shared.escapeAttr(pageData.codigoObjetoPostalModal || '')}">
              <div class="ecarta-hint">Este código será usado na certidão e na consulta dos Correios.</div>
            </div>

            <div class="ecarta-field full ${trackingAvailable ? '' : 'ecarta-row-hidden'}" id="ecarta-correios-status-row">
              <label>Situação confirmada nos Correios</label>
              <select id="ecarta-correios-status">
                ${PJeCertidoes.statusOptions.map(opt => `
                  <option value="${Shared.escapeAttr(opt.value)}" ${opt.value === initialCertType ? 'selected' : ''}>${Shared.escapeHtml(opt.label)}</option>
                `).join('')}
              </select>
            </div>

            <div class="ecarta-field ${trackingAvailable ? '' : 'ecarta-row-hidden'}" id="ecarta-data-entrega-row">
              <label>Data da entrega</label>
              <input type="date" id="ecarta-data-entrega" value="${Shared.escapeAttr(initialDataEntrega)}">
            </div>

            <div class="ecarta-field ${trackingAvailable ? '' : 'ecarta-row-hidden'}" id="ecarta-status-descricao-row">
              <label>Descrição do status confirmado</label>
              <input type="text" id="ecarta-status-descricao" value="${Shared.escapeAttr(initialStatusDescricao)}">
            </div>

            <div class="ecarta-field full">
              <label>Último retorno automático dos Correios</label>
              <input type="text" id="ecarta-retorno-correios" class="ecarta-readonly" readonly value="${Shared.escapeAttr(PJeCertidoes.formatTrackingSummary(pageData.trackingSalvo))}">
            </div>

            <div class="ecarta-field full">
              <label>Texto da certidão</label>
              <textarea id="ecarta-texto-certidao" class="ecarta-certidao-readonly ${hasImmediateCertidao ? '' : 'ecarta-row-hidden'}" readonly spellcheck="false"></textarea>
              <div id="ecarta-placeholder" class="ecarta-placeholder ${hasImmediateCertidao ? 'ecarta-row-hidden' : ''}">
                Realize a consulta aos Correios para gerar a certidão desta linha.
              </div>

              <div class="ecarta-checkbox-wrap ${pageData.codigoValido ? '' : 'ecarta-row-hidden'}" id="ecarta-sem-ar-fisico-row">
                <input type="checkbox" id="ecarta-sem-ar-fisico">
                <label for="ecarta-sem-ar-fisico">Sem juntada de AR físico</label>
              </div>

              <div class="ecarta-hint">O texto é exibido apenas para conferência. A cópia é feita pelo botão.</div>
            </div>
          </div>
        </div>

        <div class="ecarta-modal-footer">
          <button type="button" class="ecarta-btn secondary" id="ecarta-fechar-btn">Fechar</button>
          <button type="button" class="ecarta-btn success" id="ecarta-consultar-correios-btn">Consultar Correios</button>
          <button type="button" class="ecarta-btn info" id="ecarta-aplicar-salvo-btn">Aplicar último retorno</button>
          <button type="button" class="ecarta-btn" id="ecarta-copiar-btn">Copiar</button>
        </div>
      `;

      overlay.appendChild(modal);
      document.body.appendChild(overlay);

      PJeCertidoes.currentModalApi = PJeCertidoes.bindModalEvents({
        overlay,
        pageData,
        classification,
        defaultText,
        hasImmediateCertidao
      });
    },

    bindModalEvents({ overlay, pageData, classification, defaultText, hasImmediateCertidao }) {
      const idAutosInput = overlay.querySelector('#ecarta-id-autos');
      const idObjetoPostalModalInput = overlay.querySelector('#ecarta-id-objeto-postal-modal');
      const semArFisicoCheckbox = overlay.querySelector('#ecarta-sem-ar-fisico');
      const correiosStatusRow = overlay.querySelector('#ecarta-correios-status-row');
      const correiosStatusSelect = overlay.querySelector('#ecarta-correios-status');
      const dataEntregaRow = overlay.querySelector('#ecarta-data-entrega-row');
      const dataEntregaInput = overlay.querySelector('#ecarta-data-entrega');
      const statusDescricaoRow = overlay.querySelector('#ecarta-status-descricao-row');
      const statusDescricaoInput = overlay.querySelector('#ecarta-status-descricao');
      const textoTextarea = overlay.querySelector('#ecarta-texto-certidao');
      const placeholder = overlay.querySelector('#ecarta-placeholder');
      const retornoCorreiosInput = overlay.querySelector('#ecarta-retorno-correios');
      const fecharBtn = overlay.querySelector('#ecarta-fechar-btn');
      const copiarBtn = overlay.querySelector('#ecarta-copiar-btn');
      const consultarCorreiosBtn = overlay.querySelector('#ecarta-consultar-correios-btn');
      const aplicarSalvoBtn = overlay.querySelector('#ecarta-aplicar-salvo-btn');

      let certidaoReady = hasImmediateCertidao;

      textoTextarea.value = defaultText;

      textoTextarea.addEventListener('mousedown', (event) => event.preventDefault());
      textoTextarea.addEventListener('selectstart', (event) => event.preventDefault());

      const hasTrackingVisible = () =>
        correiosStatusRow && !correiosStatusRow.classList.contains('ecarta-row-hidden');

      const showTrackingFields = () => {
        PJeCertidoes.toggleRow(correiosStatusRow, true);
        PJeCertidoes.toggleRow(dataEntregaRow, true);
        refreshConditionalFields();
      };

      const showTextArea = () => {
        textoTextarea.classList.remove('ecarta-row-hidden');
        placeholder.classList.add('ecarta-row-hidden');
      };

      const refreshConditionalFields = () => {
        if (!hasTrackingVisible() || !correiosStatusSelect) return;

        const selected = correiosStatusSelect.value;
        PJeCertidoes.toggleRow(dataEntregaRow, true);
        PJeCertidoes.toggleRow(statusDescricaoRow, selected !== 'CORREIOS_ENTREGUE' && selected !== 'CORREIOS_NAO_CONSULTADO');

        if (selected === 'CORREIOS_ENTREGUE' && !statusDescricaoInput.value) {
          statusDescricaoInput.value = 'Objeto entregue ao destinatário';
        }

        if (selected === 'CORREIOS_NAO_CONSULTADO') {
          statusDescricaoInput.value = '';
        }
      };

      const refreshText = () => {
        const certidaoType = hasTrackingVisible()
          ? (correiosStatusSelect?.value || 'CORREIOS_ENTREGUE')
          : classification.code;

        const text = Templates.buildCertidao({
          pageData,
          certidaoType,
          idAutos: idAutosInput.value,
          dataEntrega: dataEntregaInput?.value || '',
          statusDescricao: statusDescricaoInput?.value || '',
          codigoObjetoPostal: Shared.normalizeSpaces(idObjetoPostalModalInput.value),
          incluirSemJuntadaArFisico: Boolean(pageData.codigoValido && semArFisicoCheckbox?.checked)
        });

        textoTextarea.value = text;
      };

      const applyTrackingData = (payload) => {
        const codigoAtual = Shared.normalizeSpaces(idObjetoPostalModalInput.value).toUpperCase();
        const codigoPayload = Shared.normalizeSpaces(payload?.codigo || '').toUpperCase();

        if (!codigoPayload && codigoAtual) {
          payload.codigo = codigoAtual;
        }

        if (codigoPayload && codigoAtual && codigoPayload !== codigoAtual) return;

        if (payload.codigo) {
          idObjetoPostalModalInput.value = payload.codigo;
        }

        showTrackingFields();
        showTextArea();

        if (correiosStatusSelect) {
          correiosStatusSelect.value = PJeCertidoes.inferCorreiosCertType(payload);
        }

        if (dataEntregaInput) {
          dataEntregaInput.value = payload.dataEntregaISO || '';
        }

        if (statusDescricaoInput) {
          statusDescricaoInput.value = payload.status || '';
        }

        retornoCorreiosInput.value = PJeCertidoes.formatTrackingSummary(payload);

        certidaoReady = true;
        refreshConditionalFields();
        refreshText();

        Shared.showToast(`Modal atualizado com retorno dos Correios: ${payload.status || 'sem status'}`);
      };

      const applySavedTrackingForCurrentCode = () => {
        const codigo = Shared.normalizeSpaces(idObjetoPostalModalInput.value).toUpperCase();
        if (!Shared.isValidPostalCode(codigo)) {
          Shared.showToast('Informe um código válido para aplicar retorno salvo.');
          return;
        }

        const saved = Shared.getTrackingPayload(codigo);
        if (!saved) {
          Shared.showToast('Não há retorno salvo dos Correios para esse código.');
          return;
        }

        applyTrackingData(saved);
      };

      idAutosInput.addEventListener('input', () => {
        if (certidaoReady) refreshText();
      });

      idObjetoPostalModalInput.addEventListener('input', () => {
        const saved = Shared.getTrackingPayload(Shared.normalizeSpaces(idObjetoPostalModalInput.value).toUpperCase());
        retornoCorreiosInput.value = PJeCertidoes.formatTrackingSummary(saved);
        if (certidaoReady) refreshText();
      });

      if (semArFisicoCheckbox) {
        semArFisicoCheckbox.addEventListener('change', () => {
          if (certidaoReady) refreshText();
        });
      }

      if (correiosStatusSelect) {
        correiosStatusSelect.addEventListener('change', () => {
          refreshConditionalFields();
          if (certidaoReady) refreshText();
        });
      }

      if (dataEntregaInput) dataEntregaInput.addEventListener('input', () => { if (certidaoReady) refreshText(); });
      if (statusDescricaoInput) statusDescricaoInput.addEventListener('input', () => { if (certidaoReady) refreshText(); });

      fecharBtn.addEventListener('click', PJeCertidoes.destroyModal);

      consultarCorreiosBtn.addEventListener('click', () => {
        const codigo = Shared.normalizeSpaces(idObjetoPostalModalInput.value).toUpperCase();
        if (!Shared.isValidPostalCode(codigo)) {
          Shared.showToast('Preencha um código localizador válido antes de consultar os Correios.');
          idObjetoPostalModalInput.focus();
          return;
        }

        sessionStorage.setItem(APP.storage.pendingCode, codigo);
        window.open(`${APP.correiosOrigin}/app/index.php?objetos=${encodeURIComponent(codigo)}`, '_blank');
        Shared.showToast('Página dos Correios aberta. Após o captcha, o retorno pode voltar automaticamente para este modal.');
      });

      aplicarSalvoBtn.addEventListener('click', applySavedTrackingForCurrentCode);

      overlay.addEventListener('click', (event) => {
        if (event.target === overlay) PJeCertidoes.destroyModal();
      });

      document.addEventListener('keydown', PJeCertidoes.onEscClose, { once: true });

      copiarBtn.onclick = async function () {
        const idAutos = Shared.normalizeSpaces(idAutosInput.value);
        if (!idAutos) {
          Shared.showToast('Preencha o ID Processo Documento correspondente.');
          idAutosInput.focus();
          return;
        }

        if (!certidaoReady) {
          Shared.showToast('Realize a consulta aos Correios antes de copiar esta certidão.');
          return;
        }

        refreshText();

        const textoParaCopiar = Shared.removeCertidaoTitle(textoTextarea.value);

        try {
          const result = await Shared.copyTextToClipboard(textoParaCopiar);
          Shared.showToast(`Certidão copiada com sucesso. Método: ${result.method}`);
        } catch (error) {
          console.error('[E-Carta Certidões] Erro ao copiar:', error);
          try {
            window.prompt('Copie manualmente a certidão abaixo:', textoParaCopiar);
          } catch (_) {}
          Shared.showToast('Falha na cópia automática. O texto foi aberto para cópia manual.');
        }
      };

      refreshConditionalFields();
      if (hasImmediateCertidao) showTextArea();

      return { applyTrackingData, destroy: PJeCertidoes.destroyModal };
    },

    toggleRow(row, show) {
      if (!row) return;
      row.classList.toggle('ecarta-row-hidden', !show);
    },

    onEscClose(event) {
      if (event.key === 'Escape') PJeCertidoes.destroyModal();
    },

    destroyModal() {
      const overlay = document.getElementById(`${PJeCertidoes.config.modalId}-overlay`);
      if (overlay) overlay.remove();
      PJeCertidoes.currentModalApi = null;
    }
  };

  const PJeExpedientesMonitorLink = {
    init() {
      PJeExpedientesMonitorLink.injectStyles();
      PJeExpedientesMonitorLink.observe();
      PJeExpedientesMonitorLink.enhance();
    },

    injectStyles() {
      if (document.getElementById('pje-monitor-link-style')) return;

      const style = document.createElement('style');
      style.id = 'pje-monitor-link-style';
      style.textContent = `
        .pje-monitor-correios-link {
          cursor: pointer;
          margin-left: 6px;
          user-select: none;
          display: inline-flex;
          align-items: center;
          vertical-align: middle;
          color: inherit;
          opacity: .85;
        }

        .pje-monitor-correios-link:hover {
          opacity: 1;
        }

        .pje-monitor-correios-inline {
          display: inline-flex;
          align-items: center;
        }
      `;
      document.head.appendChild(style);
    },

    observe() {
      const observer = new MutationObserver(() => {
        PJeExpedientesMonitorLink.enhance();
      });

      observer.observe(document.documentElement, {
        childList: true,
        subtree: true
      });
    },

    enhance() {
      const processNumber = Shared.getProcessNumberFromTop();
      if (!processNumber) return;

      const table = document.querySelector('#processoParteExpedienteMenuGridList');
      if (!table) return;

      const rows = [...table.querySelectorAll('tbody tr.rich-table-row, tbody tr')];

      rows.forEach((row) => {
        if (row.dataset.monitorCorreiosEnhanced === 'true') return;

        const firstCell = row.querySelector('td');
        if (!firstCell) return;

        const rowText = Shared.normalizeSpaces(firstCell.textContent || '');
        if (!/correios\s*\(/i.test(rowText)) return;

        const iconWrapper = document.createElement('span');
        iconWrapper.className = 'pje-monitor-correios-link';
        iconWrapper.title = 'Abrir Monitor E-Carta';
        iconWrapper.setAttribute('aria-label', 'Abrir Monitor E-Carta');
        iconWrapper.tabIndex = 0;
        iconWrapper.innerHTML = `<i class="fa fa-external-link" aria-hidden="true"></i>`;

        const openMonitor = (event) => {
          event.preventDefault();
          event.stopPropagation();
          try {
            sessionStorage.setItem(APP.storage.pendingMonitorProcess, processNumber);
            sessionStorage.removeItem(APP.storage.monitorAutofillDone);
          } catch (error) {
            console.warn('[Monitor E-Carta] Falha ao salvar processo pendente:', error);
          }
          window.open(`${APP.pjeOrigin}${APP.paths.monitorEcarta}`, '_blank');
        };

        iconWrapper.addEventListener('click', openMonitor);
        iconWrapper.addEventListener('keydown', (event) => {
          if (event.key === 'Enter' || event.key === ' ') openMonitor(event);
        });

        const inserted = PJeExpedientesMonitorLink.attachToCorreiosLine(firstCell, iconWrapper);

        if (inserted) row.dataset.monitorCorreiosEnhanced = 'true';
      });
    },

    attachToCorreiosLine(container, iconWrapper) {
      const walker = document.createTreeWalker(
        container,
        NodeFilter.SHOW_TEXT,
        {
          acceptNode(node) {
            const text = Shared.normalizeSpaces(node.nodeValue || '');
            return /Correios\s*\(/i.test(text)
              ? NodeFilter.FILTER_ACCEPT
              : NodeFilter.FILTER_SKIP;
          }
        }
      );

      const textNode = walker.nextNode();
      if (!textNode) return false;

      const parent = textNode.parentNode;
      if (!parent) return false;

      if (parent.querySelector && parent.querySelector('.pje-monitor-correios-link')) return true;

      const originalText = textNode.nodeValue || '';
      const match = originalText.match(/(Correios\s*\([^)]+\))/i);
      if (!match) return false;

      const before = originalText.slice(0, match.index);
      const lineText = match[1];
      const after = originalText.slice((match.index || 0) + lineText.length);

      const fragment = document.createDocumentFragment();

      if (before) fragment.appendChild(document.createTextNode(before));

      const lineSpan = document.createElement('span');
      lineSpan.className = 'pje-monitor-correios-inline';
      lineSpan.appendChild(document.createTextNode(lineText));
      lineSpan.appendChild(iconWrapper);

      fragment.appendChild(lineSpan);

      if (after) fragment.appendChild(document.createTextNode(after));

      parent.replaceChild(fragment, textNode);
      return true;
    }
  };

  const PJeMonitorAutoSearch = {
    init() {
      PJeMonitorAutoSearch.observeAndTry();
      PJeMonitorAutoSearch.tryFillAndSearch();
    },

    observeAndTry() {
      const observer = new MutationObserver(() => {
        if (PJeMonitorAutoSearch.tryFillAndSearch()) observer.disconnect();
      });

      observer.observe(document.documentElement, {
        childList: true,
        subtree: true
      });
    },

    tryFillAndSearch() {
      const processNumber = sessionStorage.getItem(APP.storage.pendingMonitorProcess) || '';
      if (!processNumber) return false;

      const alreadyDone = sessionStorage.getItem(APP.storage.monitorAutofillDone) === processNumber;
      if (alreadyDone) return true;

      const input = document.querySelector('#ecartaSearchForm\\:numProcessoDecoration\\:numProcesso');
      const button = document.querySelector('#ecartaSearchForm\\:searchButton');

      if (!input || !button) return false;

      input.value = processNumber;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));

      sessionStorage.setItem(APP.storage.monitorAutofillDone, processNumber);

      setTimeout(() => {
        button.click();
        Shared.showToast(`Monitor E-Carta pesquisado para o processo ${processNumber}.`);
      }, 150);

      return true;
    }
  };

  const CorreiosTracking = {
    observer: null,
    lastSentSignature: '',
    sentOnce: false,

    init() {
      CorreiosTracking.injectStyles();
      CorreiosTracking.observeResults();
      CorreiosTracking.trySendTrackingData();
    },

    injectStyles() {
      if (document.getElementById('ecarta-correios-helper-style')) return;

      const style = document.createElement('style');
      style.id = 'ecarta-correios-helper-style';
      style.textContent = `
        #ecarta-correios-helper-flag {
          position: fixed;
          right: 12px;
          bottom: 12px;
          z-index: 999999;
          background: rgba(17,24,39,0.92);
          color: white;
          padding: 8px 10px;
          border-radius: 8px;
          font-size: 12px;
          font-family: Arial, sans-serif;
          box-shadow: 0 6px 18px rgba(0,0,0,0.2);
        }
      `;
      document.head.appendChild(style);
    },

    observeResults() {
      CorreiosTracking.observer = new MutationObserver(() => {
        if (CorreiosTracking.sentOnce) return;
        CorreiosTracking.trySendTrackingData();
      });

      CorreiosTracking.observer.observe(document.documentElement, {
        childList: true,
        subtree: true
      });
    },

    stopObserver() {
      if (CorreiosTracking.observer) {
        CorreiosTracking.observer.disconnect();
        CorreiosTracking.observer = null;
      }
    },

    updateStatusFlag(text) {
      let flag = document.getElementById('ecarta-correios-helper-flag');
      if (!flag) {
        flag = document.createElement('div');
        flag.id = 'ecarta-correios-helper-flag';
        document.body.appendChild(flag);
      }
      flag.textContent = text;
    },

    buildPayloadSignature(payload) {
      return [
        Shared.normalizeSpaces(payload?.codigo || ''),
        Shared.normalizeSpaces(payload?.status || ''),
        Shared.normalizeSpaces(payload?.local || ''),
        Shared.normalizeSpaces(payload?.dataHora || '')
      ].join('|');
    },

    trySendTrackingData() {
      const payload = CorreiosTracking.parseTracking();
      if (!payload) return;

      const signature = CorreiosTracking.buildPayloadSignature(payload);
      if (signature && signature === CorreiosTracking.lastSentSignature) return;

      CorreiosTracking.updateStatusFlag(`Retorno lido: ${payload.status}`);

      if (window.opener && !window.opener.closed) {
        window.opener.postMessage({ type: APP.messageType, payload }, APP.pjeOrigin);

        CorreiosTracking.lastSentSignature = signature;
        CorreiosTracking.sentOnce = true;
        CorreiosTracking.stopObserver();

        CorreiosTracking.updateStatusFlag(`Retorno enviado: ${payload.status}`);
      } else {
        CorreiosTracking.updateStatusFlag(`Sem opener: ${payload.status}`);
      }
    },

    parseTracking() {
      const trackingRoot = CorreiosTracking.getVisibleTrackingRoot();
      if (!trackingRoot) return null;

      const step = trackingRoot.querySelector('.ship-steps .step');
      if (!step) return null;

      const codigo = CorreiosTracking.getTrackingCode();

      const headEls = step.querySelectorAll('.text-head');
      const contentEls = step.querySelectorAll('.text-content');

      const status = Shared.normalizeSpaces(headEls[0]?.textContent || '');
      const local = Shared.normalizeSpaces(contentEls[0]?.textContent || '');
      const dataHora = Shared.normalizeSpaces(contentEls[contentEls.length - 1]?.textContent || '');

      if (!status) return null;

      return {
        codigo,
        status,
        local,
        dataHora,
        dataEntregaISO: Shared.extractIsoDate(dataHora),
        rawSteps: CorreiosTracking.extractAllSteps(trackingRoot)
      };
    },

    getVisibleTrackingRoot() {
      const unique = document.querySelector('#ver-rastro-unico');
      const normal = document.querySelector('#ver-mais');

      if (CorreiosTracking.isVisible(unique)) return unique;
      if (CorreiosTracking.isVisible(normal)) return normal;

      return document.querySelector('#tabs-rastreamento');
    },

    isVisible(el) {
      if (!el) return false;
      const style = window.getComputedStyle(el);
      return style.display !== 'none' && style.visibility !== 'hidden';
    },

    getTrackingCode() {
      const inputCode = Shared.normalizeSpaces(document.querySelector('#objeto')?.value || '').toUpperCase();
      if (inputCode) return inputCode;

      const hiddenDoc = Shared.normalizeSpaces(document.querySelector('#documento')?.value || '').toUpperCase();
      if (Shared.isValidPostalCode(hiddenDoc)) return hiddenDoc;

      const breadcrumbCode = Shared.normalizeSpaces(document.querySelector('#trilha a:last-child')?.textContent || '')
        .replace(/\s+/g, '')
        .toUpperCase();
      if (Shared.isValidPostalCode(breadcrumbCode)) return breadcrumbCode;

      const titleCode = Shared.normalizeSpaces(document.querySelector('#titulo-pagina h3')?.textContent || '')
        .replace(/\s+/g, '')
        .toUpperCase();
      if (Shared.isValidPostalCode(titleCode)) return titleCode;

      const queryCode = new URLSearchParams(location.search).get('objetos');
      if (Shared.isValidPostalCode(queryCode || '')) return String(queryCode).toUpperCase();

      const pendingCode = sessionStorage.getItem(APP.storage.pendingCode) || '';
      if (Shared.isValidPostalCode(pendingCode)) return pendingCode.toUpperCase();

      return '';
    },

    extractAllSteps(trackingRoot) {
      return [...trackingRoot.querySelectorAll('.ship-steps .step')].map(step => {
        const heads = [...step.querySelectorAll('.text-head')].map(el => Shared.normalizeSpaces(el.textContent));
        const contents = [...step.querySelectorAll('.text-content')].map(el => Shared.normalizeSpaces(el.textContent));
        return {
          titulo: heads[0] || '',
          observacao: heads[1] || '',
          local: contents[0] || '',
          dataHora: contents[contents.length - 1] || ''
        };
      });
    }
  };

  Shared.injectGlobalStyles();

  if (isEcartaDetalhePage()) {
    PJeCertidoes.init();
  }

  if (isAutosDigitaisPage()) {
    PJeExpedientesMonitorLink.init();
  }

  if (isEcartaMonitorPage()) {
    PJeMonitorAutoSearch.init();
  }

  if (isCorreiosPage()) {
    CorreiosTracking.init();
  }
})();
