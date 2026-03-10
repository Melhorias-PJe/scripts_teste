// ==UserScript==
// @name         PJe TJCE - Reorganizar Checkboxes de Análise
// @namespace    http://tampermonkey.net/
// @version      0.9.0
// @description  Reorganiza os checkboxes da tarefa Analisar Processos em grupos, com filtro, contador e cards clicáveis.
// @author       Nigério Bezerra
// @match        https://pje.tjce.jus.br/pje1grau/*
// @match        https://pje-treinamento-release.tjce.jus.br/pje1grau/*
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  const PAINEL_ID = 'nj-pje-painel-checkboxes-analise';
  const ESTILO_ID = 'nj-pje-estilo-checkboxes-analise';

  const GRUPOS = [
    {
      titulo: 'Prazos e aguardos',
      itens: [
        'Aguardar laudo técnico',
        'Aguardar decurso de prazo',
        'Aguardar decurso de prazo de recurso',
        'Aguardar cumprimento de diligência',
        'Aguardar julgamento de conflito de competência'
      ]
    },
    {
      titulo: 'Expedição e comunicação',
      itens: [
        'Citar/Intimar',
        'Expedir ofício',
        'Expedir mandado',
        'Expedir carta precatória / rogatória',
        'Expedir edital',
        'Elaborar publicação no DJEN',
        'Expedir ato ordinatório',
        'Expedir outros documentos'
      ]
    },
    {
      titulo: 'Certidões e registros',
      itens: [
        'Certificar decurso de prazo',
        'Certificar trânsito em julgado',
        'Registrar fechamento manual de expediente',
        'Reclassificar tipo de documento'
      ]
    },
    {
      titulo: 'Atos de constrição e pesquisa',
      itens: [
        'Minutar Bloqueio/Desbloqueio - SISBAJUD',
        'Consultar INFOJUD/INFOSEG',
        'Consultar RENAJUD',
        'Consultar SERASAJUD'
      ]
    },
    {
      titulo: 'Cálculo e pagamento',
      itens: [
        'Elaborar cálculos',
        'Expedir alvará',
        'Emitir alvará eletrônico - SAE',
        'Controlar Precatórios e RPV'
      ]
    },
    {
      titulo: 'Gestão processual',
      itens: [
        'Apensar processo',
        'Gerenciar audiência',
        'Gerenciar perícia'
      ]
    }
  ];

  function normalizarTexto(texto) {
    return (texto || '').replace(/\s+/g, ' ').trim();
  }

  function normalizarBusca(texto) {
    return (texto || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ')
      .toLowerCase()
      .trim();
  }

  function hasLabel(textoExato) {
    return Array.from(document.querySelectorAll('div.propertyView label'))
      .some(label => normalizarTexto(label.textContent) === textoExato);
  }

  function isTelaAnalisarProcessos() {
    const temTaskForm = !!document.querySelector('[id^="taskInstanceForm:"]');
    const temVisualizadorDecisao =
      !!document.querySelector('[id*=":visualiza_Decisao-"]') ||
      !!document.querySelector('#paginaInteira');

    const temCheckboxesCaracteristicas =
      hasLabel('Aguardar laudo técnico') &&
      hasLabel('Aguardar decurso de prazo') &&
      hasLabel('Expedir ofício') &&
      hasLabel('Citar/Intimar');

    return temTaskForm && temVisualizadorDecisao && temCheckboxesCaracteristicas;
  }

  function injectStyles() {
    if (document.getElementById(ESTILO_ID)) return;

    const style = document.createElement('style');
    style.id = ESTILO_ID;
    style.textContent = `
      #${PAINEL_ID} {
        margin: 16px 0;
        border: 1px solid #d8dde6;
        border-radius: 10px;
        background: #f8fafc;
        box-shadow: 0 1px 4px rgba(0,0,0,.06);
        overflow: hidden;
        font-family: Arial, sans-serif;
      }

      #${PAINEL_ID} .nj-topbar {
        display: flex;
        gap: 12px;
        align-items: center;
        justify-content: space-between;
        flex-wrap: wrap;
        padding: 12px 14px;
        background: #eef3f8;
        border-bottom: 1px solid #d8dde6;
      }

      #${PAINEL_ID} .nj-title {
        font-size: 14px;
        font-weight: 700;
        color: #243447;
      }

      #${PAINEL_ID} .nj-subtitle {
        font-size: 12px;
        color: #5b6b7d;
      }

      #${PAINEL_ID} .nj-top-meta {
        display: flex;
        gap: 10px;
        align-items: center;
        flex-wrap: wrap;
      }

      #${PAINEL_ID} .nj-counter {
        font-size: 12px;
        color: #243447;
        background: #fff;
        border: 1px solid #c7d0db;
        border-radius: 999px;
        padding: 6px 10px;
        font-weight: 600;
      }

      #${PAINEL_ID} .nj-filter {
        min-width: 280px;
        max-width: 360px;
        padding: 7px 10px;
        border: 1px solid #c7d0db;
        border-radius: 6px;
        outline: none;
        font-size: 13px;
        background: #fff;
      }

      #${PAINEL_ID} .nj-actions {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
      }

      #${PAINEL_ID} .nj-btn {
        padding: 6px 10px;
        font-size: 12px;
        border: 1px solid #c7d0db;
        border-radius: 6px;
        background: #fff;
        cursor: pointer;
      }

      #${PAINEL_ID} .nj-btn:hover {
        background: #f1f5f9;
      }

      #${PAINEL_ID} .nj-groups {
        padding: 12px;
      }

      #${PAINEL_ID} .nj-group {
        border: 1px solid #dfe5ec;
        border-radius: 8px;
        background: #fff;
        margin-bottom: 12px;
        overflow: hidden;
      }

      #${PAINEL_ID} .nj-group-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 12px;
        padding: 10px 12px;
        background: #f3f6fa;
        cursor: pointer;
        user-select: none;
      }

      #${PAINEL_ID} .nj-group-title {
        font-size: 13px;
        font-weight: 700;
        color: #243447;
      }

      #${PAINEL_ID} .nj-group-meta {
        font-size: 12px;
        color: #5b6b7d;
        white-space: nowrap;
      }

      #${PAINEL_ID} .nj-group-body {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
        gap: 10px 14px;
        padding: 12px;
      }

      #${PAINEL_ID} .nj-group.is-collapsed .nj-group-body {
        display: none;
      }

      #${PAINEL_ID} .nj-item {
        position: relative;
        margin: 0 !important;
        padding: 10px 12px !important;
        border: 1px solid #d9e2ec;
        border-radius: 10px;
        background: #ffffff;
        min-height: 58px;
        cursor: pointer;
        transition: all .15s ease;
      }

      #${PAINEL_ID} .nj-item:hover {
        border-color: #b8c7d9;
        background: #f8fbff;
        box-shadow: 0 1px 4px rgba(0,0,0,.05);
      }

      #${PAINEL_ID} .nj-item.nj-checked {
        border-color: #8fb3ff;
        background: #eef4ff;
        box-shadow: inset 0 0 0 1px #c9dbff;
      }

      #${PAINEL_ID} .nj-item .name {
        float: none !important;
        width: auto !important;
        margin-bottom: 6px;
      }

      #${PAINEL_ID} .nj-item .value {
        float: none !important;
        width: auto !important;
        padding: 0 !important;
      }

      #${PAINEL_ID} .nj-item label {
        display: inline-block;
        font-weight: 600;
        cursor: pointer;
        line-height: 1.35;
      }

      #${PAINEL_ID} .nj-item input[type="checkbox"] {
        width: 18px;
        height: 18px;
        cursor: pointer;
        accent-color: #2f6fed;
        transform: none;
      }

      #${PAINEL_ID} .nj-hidden-by-filter {
        display: none !important;
      }

      #${PAINEL_ID} .nj-empty {
        padding: 16px;
        text-align: center;
        color: #718096;
        font-size: 13px;
        grid-column: 1 / -1;
      }
    `;
    document.head.appendChild(style);
  }

  function getAllPropertyViews() {
    return Array.from(document.querySelectorAll('div.propertyView'));
  }

  function getCheckboxBlocks() {
    return getAllPropertyViews().filter(block => {
      return !!block.querySelector('input[type="checkbox"]') && !!block.querySelector('label');
    });
  }

  function getBlockLabel(block) {
    return normalizarTexto(block.querySelector('label')?.textContent);
  }

  function getOriginalContainer(blocks) {
    if (!blocks.length) return null;
    return blocks[0].parentElement;
  }

  function buildMapByLabel(blocks) {
    const map = new Map();
    blocks.forEach(block => {
      const label = getBlockLabel(block);
      if (label) map.set(label, block);
    });
    return map;
  }

  function markItemStyled(block, groupTitle) {
    block.classList.add('nj-item');
    block.dataset.itemLabel = getBlockLabel(block);
    block.dataset.originalGroup = groupTitle;
  }

  function createTopbar() {
    const topbar = document.createElement('div');
    topbar.className = 'nj-topbar';

    const info = document.createElement('div');
    info.innerHTML = `
      <div class="nj-title">Painel Anasisar Processos</div>
      <div class="nj-subtitle">Agrupamento visual para facilitar a triagem processual</div>
    `;

    const right = document.createElement('div');
    right.className = 'nj-top-meta';

    const counter = document.createElement('div');
    counter.className = 'nj-counter';
    counter.textContent = 'Marcados: 0';

    const filterInput = document.createElement('input');
    filterInput.type = 'text';
    filterInput.className = 'nj-filter';
    filterInput.placeholder = 'Filtrar por texto... ex.: oficio, prazo, alvara';

    const actions = document.createElement('div');
    actions.className = 'nj-actions';

    const btnExpandir = document.createElement('button');
    btnExpandir.type = 'button';
    btnExpandir.className = 'nj-btn';
    btnExpandir.textContent = 'Expandir tudo';

    const btnRecolher = document.createElement('button');
    btnRecolher.type = 'button';
    btnRecolher.className = 'nj-btn';
    btnRecolher.textContent = 'Recolher tudo';

    actions.appendChild(btnExpandir);
    actions.appendChild(btnRecolher);

    right.appendChild(counter);
    right.appendChild(filterInput);
    right.appendChild(actions);

    topbar.appendChild(info);
    topbar.appendChild(right);

    return { topbar, filterInput, btnExpandir, btnRecolher };
  }

  function createGroup(title) {
    const section = document.createElement('section');
    section.className = 'nj-group';
    section.dataset.groupTitle = title;

    const header = document.createElement('div');
    header.className = 'nj-group-header';

    const titleEl = document.createElement('div');
    titleEl.className = 'nj-group-title';
    titleEl.textContent = title;

    const meta = document.createElement('div');
    meta.className = 'nj-group-meta';
    meta.textContent = '0 item(ns)';

    const body = document.createElement('div');
    body.className = 'nj-group-body';
    body.dataset.groupBody = title;

    header.appendChild(titleEl);
    header.appendChild(meta);
    section.appendChild(header);
    section.appendChild(body);

    header.addEventListener('click', () => {
      section.classList.toggle('is-collapsed');
    });

    return { section, body, meta };
  }

  function updateMarkedStates(panel) {
    panel.querySelectorAll('.nj-item').forEach(item => {
      const checkbox = item.querySelector('input[type="checkbox"]');
      item.classList.toggle('nj-checked', !!checkbox?.checked);
    });
  }

  function updateMarkedCounter(panel) {
    const counter = panel.querySelector('.nj-counter');
    if (!counter) return;
    const total = panel.querySelectorAll('.nj-item input[type="checkbox"]:checked').length;
    counter.textContent = `Marcados: ${total}`;
  }

  function updateGroupCounters(panel) {
    const groups = Array.from(panel.querySelectorAll('.nj-group'));

    groups.forEach(group => {
      const body = group.querySelector('.nj-group-body');
      const meta = group.querySelector('.nj-group-meta');
      if (!body || !meta) return;

      const items = Array.from(body.children);
      const visibleItems = items.filter(item => !item.classList.contains('nj-hidden-by-filter'));

      meta.textContent = `${items.length} item(ns)`;
      group.style.display = visibleItems.length ? '' : 'none';
    });

    const visibleGroups = groups.filter(group => group.style.display !== 'none');
    let empty = panel.querySelector('.nj-empty');

    if (!visibleGroups.length) {
      if (!empty) {
        empty = document.createElement('div');
        empty.className = 'nj-empty';
        empty.textContent = 'Nenhum checkbox encontrado para o filtro informado.';
        panel.querySelector('.nj-groups')?.appendChild(empty);
      }
    } else if (empty) {
      empty.remove();
    }
  }

  function applyFilter(panel, value) {
    const query = normalizarBusca(value);
    const termos = query ? query.split(' ').filter(Boolean) : [];

    const items = Array.from(panel.querySelectorAll('.nj-item'));

    items.forEach(item => {
      const label = normalizarBusca(item.dataset.itemLabel || '');
      const visible = !termos.length || termos.every(termo => label.includes(termo));
      item.classList.toggle('nj-hidden-by-filter', !visible);
    });

    updateGroupCounters(panel);
  }

  function expandAll(panel) {
    panel.querySelectorAll('.nj-group').forEach(group => {
      group.classList.remove('is-collapsed');
    });
  }

  function collapseAll(panel) {
    panel.querySelectorAll('.nj-group').forEach(group => {
      group.classList.add('is-collapsed');
    });
  }

  function createPanel() {
    const panel = document.createElement('div');
    panel.id = PAINEL_ID;

    const { topbar, filterInput, btnExpandir, btnRecolher } = createTopbar();
    const groupsWrap = document.createElement('div');
    groupsWrap.className = 'nj-groups';

    panel.appendChild(topbar);
    panel.appendChild(groupsWrap);

    filterInput.addEventListener('input', () => applyFilter(panel, filterInput.value));
    btnExpandir.addEventListener('click', () => expandAll(panel));
    btnRecolher.addEventListener('click', () => collapseAll(panel));

    panel.addEventListener('click', (event) => {
      const item = event.target.closest('.nj-item');
      if (!item) return;

      if (event.target.tagName === 'INPUT' || event.target.tagName === 'LABEL') {
        return;
      }

      const checkbox = item.querySelector('input[type="checkbox"]');
      if (checkbox) checkbox.click();
    });

    panel.addEventListener('change', (event) => {
      if (event.target.matches('input[type="checkbox"]')) {
        updateMarkedStates(panel);
        updateMarkedCounter(panel);
      }
    });

    panel.addEventListener('click', (event) => {
      if (event.target.matches('label')) {
        setTimeout(() => {
          updateMarkedStates(panel);
          updateMarkedCounter(panel);
        }, 0);
      }
    });

    return panel;
  }

  function buildPanel(forceRebuild = false) {
    const currentSignature = JSON.stringify(
      getCheckboxBlocks()
        .map(block => getBlockLabel(block))
        .filter(Boolean)
        .sort()
    );

    if (!forceRebuild && document.getElementById(PAINEL_ID) && currentSignature === window.__njLastSignature) {
      return;
    }

    const old = document.getElementById(PAINEL_ID);
    if (old) old.remove();

    const blocks = getCheckboxBlocks();
    if (!blocks.length) return;

    const originalContainer = getOriginalContainer(blocks);
    if (!originalContainer) return;

    const panel = createPanel();
    const groupsWrap = panel.querySelector('.nj-groups');
    const map = buildMapByLabel(blocks);
    const usedLabels = new Set();

    GRUPOS.forEach(groupDef => {
      const { section, body } = createGroup(groupDef.titulo);

      const matchedBlocks = groupDef.itens
        .map(label => {
          const block = map.get(label);
          if (block) usedLabels.add(label);
          return block;
        })
        .filter(Boolean);

      if (!matchedBlocks.length) return;

      matchedBlocks.forEach(block => {
        markItemStyled(block, groupDef.titulo);
        body.appendChild(block);
      });

      groupsWrap.appendChild(section);
    });

    const remainingBlocks = Array.from(map.entries())
      .filter(([label]) => !usedLabels.has(label))
      .map(([, block]) => block);

    if (remainingBlocks.length) {
      const { section, body } = createGroup('Outros');

      remainingBlocks.forEach(block => {
        markItemStyled(block, 'Outros');
        body.appendChild(block);
      });

      groupsWrap.appendChild(section);
    }

    originalContainer.prepend(panel);

    updateMarkedStates(panel);
    updateMarkedCounter(panel);
    updateGroupCounters(panel);

    window.__njLastSignature = currentSignature;
  }

  function init(forceRebuild = false) {
    if (!isTelaAnalisarProcessos()) {
      const old = document.getElementById(PAINEL_ID);
      if (old) old.remove();
      window.__njLastSignature = '';
      return;
    }

    injectStyles();
    buildPanel(forceRebuild);
  }

  let scheduled = false;
  function scheduleInit(forceRebuild = false) {
    if (scheduled) return;
    scheduled = true;

    setTimeout(() => {
      scheduled = false;
      init(forceRebuild);
    }, 250);
  }

  init(true);

  const observer = new MutationObserver(() => {
    if (!isTelaAnalisarProcessos()) {
      const old = document.getElementById(PAINEL_ID);
      if (old) old.remove();
      window.__njLastSignature = '';
      return;
    }

    const currentSignature = JSON.stringify(
      getCheckboxBlocks()
        .map(block => getBlockLabel(block))
        .filter(Boolean)
        .sort()
    );

    if (!document.getElementById(PAINEL_ID)) {
      scheduleInit(true);
      return;
    }

    if (currentSignature !== window.__njLastSignature) {
      scheduleInit(true);
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
})();
