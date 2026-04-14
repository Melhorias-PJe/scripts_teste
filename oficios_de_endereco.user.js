// ==UserScript==
// @name         PJe TJCE – Emissão de Ofícios de Endereço (Teste)
// @namespace    local.tjce.pje.oficios.endereco
// @version      0.3.0
// @description  Abre nova janela para emissão de ofícios de endereço com captura de polo passivo, numeração sequencial e cópia individual.
// @author       Nigério Bezerra
// @match        https://pje.tjce.jus.br/*
// @match        https://pje-treinamento-release.tjce.jus.br/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(function () {
  "use strict";

  const HOTKEY = {
    ctrl: true,
    shift: true,
    key: "e",
  };

  const DESTINATARIOS = [
    { nome: "ENEL", email: "resposta.cliente@enel.com", endereco: "" },
    { nome: "Banco do Brasil", email: "cenopserv.oficioscwb@bb.com.br", endereco: "" },
    { nome: "CAGECE", email: "ouvidoria.geral@cge.ce.gov.br", endereco: "" },
    { nome: "Uber do Brasil Tecnologia Ltda.", email: "correspondencias@uber.com", endereco: "" },
    { nome: "99Pop", email: "juridico@99app.com", endereco: "" },
    { nome: "Mercado Livre", email: "oficios@mercadolivre.com", endereco: "" },
    { nome: "TIM Operadora", email: "graop_oficios@timbrasil.com.br", endereco: "" },
    { nome: "Vivo Operadora", email: "ordens.sigilo.br@telefonica.com", endereco: "" },
    { nome: "Oi (antiga Telemar)", email: "qsoi@oi.net.br", endereco: "" },
    { nome: "Claro Telefonia", email: "oficios.doc@claro.com.br", endereco: "" },
    { nome: "Junta Comercial do Estado do Ceará - JUCEC", email: "protocolo@jucec.ce.gov.br", endereco: "" },
    { nome: "DETRAN-CE", email: "judicial@detran.ce.gov.br", endereco: "" },
  ];

  let popupRef = null;

  document.addEventListener("keydown", onHotkey, true);

  function onHotkey(event) {
    const key = String(event.key || "").toLowerCase();
    if (!!event.ctrlKey !== HOTKEY.ctrl) return;
    if (!!event.shiftKey !== HOTKEY.shift) return;
    if (key !== HOTKEY.key) return;

    event.preventDefault();
    event.stopPropagation();

    openOficiosWindow();
  }

  function openOficiosWindow() {
    const requeridos = extractRequeridosFromPage();
    const processo = extractNumeroProcesso();
    const hoje = formatDateUpper(new Date());

    if (popupRef && !popupRef.closed) {
      try {
        popupRef.focus();
        popupRef.renderOficiosApp({
          requeridos,
          destinatarios: DESTINATARIOS,
          processo,
          hoje,
        });
        return;
      } catch (_) {}
    }

    popupRef = window.open("", "_blank", "width=1200,height=850,scrollbars=yes,resizable=yes");
    if (!popupRef) {
      alert("Não foi possível abrir a nova janela. Verifique se o navegador bloqueou pop-ups.");
      return;
    }

    const html = buildWindowHTML();
    popupRef.document.open();
    popupRef.document.write(html);
    popupRef.document.close();

    const payload = {
      requeridos,
      destinatarios: DESTINATARIOS,
      processo,
      hoje,
    };

    const tryInject = () => {
      try {
        if (typeof popupRef.renderOficiosApp === "function") {
          popupRef.renderOficiosApp(payload);
          popupRef.focus();
          return;
        }
      } catch (_) {}
      setTimeout(tryInject, 120);
    };

    tryInject();
  }

  function buildWindowHTML() {
    return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <title>Emissão de Ofícios de Endereço</title>
  <style>
    :root {
      --bg: #f4f6fb;
      --card: #ffffff;
      --line: #d9e0ea;
      --text: #1d2733;
      --muted: #5f6b7a;
      --blue: #1f6feb;
      --blue-dark: #0f4fbf;
      --green: #1f883d;
      --green-dark: #166c30;
      --red: #c62828;
      --shadow: 0 10px 30px rgba(0,0,0,.08);
    }

    * { box-sizing: border-box; }

    body {
      margin: 0;
      font-family: Arial, sans-serif;
      background: var(--bg);
      color: var(--text);
    }

    .topbar {
      position: sticky;
      top: 0;
      z-index: 10;
      background: var(--card);
      border-bottom: 1px solid var(--line);
      padding: 16px 20px;
      box-shadow: 0 2px 12px rgba(0,0,0,.04);
    }

    .topbar h1 {
      margin: 0;
      font-size: 24px;
    }

    .topbar .sub {
      margin-top: 4px;
      color: var(--muted);
      font-size: 13px;
    }

    .page {
      padding: 20px;
    }

    .layout {
      display: grid;
      grid-template-columns: 390px 1fr;
      gap: 20px;
      align-items: start;
    }

    .panel {
      background: var(--card);
      border: 1px solid var(--line);
      border-radius: 14px;
      box-shadow: var(--shadow);
      overflow: hidden;
    }

    .panel .head {
      padding: 14px 16px;
      border-bottom: 1px solid var(--line);
      background: #fbfcff;
      font-weight: bold;
    }

    .panel .body {
      padding: 16px;
    }

    .field {
      margin-bottom: 16px;
    }

    .field label {
      display: block;
      font-size: 13px;
      margin-bottom: 6px;
      color: var(--muted);
      font-weight: bold;
    }

    .field input[type="text"],
    .field input[type="number"] {
      width: 100%;
      padding: 10px 12px;
      border: 1px solid var(--line);
      border-radius: 10px;
      font-size: 14px;
      outline: none;
    }

    .field input[type="text"]:focus,
    .field input[type="number"]:focus {
      border-color: var(--blue);
      box-shadow: 0 0 0 3px rgba(31,111,235,.12);
    }

    .scroll-box {
      max-height: 220px;
      overflow: auto;
      border: 1px solid var(--line);
      border-radius: 10px;
      padding: 8px 10px;
      background: #fff;
    }

    .item {
      display: block;
      padding: 6px 0;
      border-bottom: 1px dashed #edf1f6;
      font-size: 14px;
    }

    .item:last-child {
      border-bottom: none;
    }

    .row {
      display: flex;
      gap: 8px;
      align-items: center;
      margin-top: 8px;
    }

    .row input[type="text"] {
      flex: 1;
    }

    .btn {
      appearance: none;
      border: none;
      border-radius: 10px;
      padding: 10px 14px;
      cursor: pointer;
      font-size: 14px;
      font-weight: bold;
      transition: .15s ease;
    }

    .btn-primary {
      background: var(--blue);
      color: white;
    }

    .btn-primary:hover {
      background: var(--blue-dark);
    }

    .btn-success {
      background: var(--green);
      color: white;
    }

    .btn-success:hover {
      background: var(--green-dark);
    }

    .btn-light {
      background: #eef3fb;
      color: #27405c;
    }

    .btn-light:hover {
      background: #dde8f7;
    }

    .btn-danger {
      background: #fbeaea;
      color: var(--red);
    }

    .btn-danger:hover {
      background: #f7dada;
    }

    .actions {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      margin-top: 12px;
    }

    .summary {
      font-size: 13px;
      color: var(--muted);
      margin-top: 8px;
      line-height: 1.4;
    }

    .result-head {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
      flex-wrap: wrap;
      margin-bottom: 12px;
    }

    .cards {
      display: flex;
      flex-direction: column;
      gap: 14px;
    }

    .oficio-card {
      border: 1px solid var(--line);
      background: white;
      border-radius: 14px;
      box-shadow: var(--shadow);
      overflow: hidden;
    }

    .oficio-toolbar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 10px;
      padding: 12px 14px;
      background: #fbfcff;
      border-bottom: 1px solid var(--line);
      flex-wrap: wrap;
    }

    .oficio-title {
      font-size: 14px;
      font-weight: bold;
    }

    .oficio-meta {
      font-size: 12px;
      color: var(--muted);
      margin-top: 2px;
    }

    .oficio-body {
      padding: 16px;
    }

    .oficio-pre {
      margin: 0;
      white-space: pre-wrap;
      word-break: break-word;
      font-family: "Times New Roman", serif;
      font-size: 15px;
      line-height: 1.6;
      color: #111;
    }

    .empty {
      border: 1px dashed var(--line);
      border-radius: 12px;
      padding: 24px;
      background: #fff;
      color: var(--muted);
      text-align: center;
    }

    @media (max-width: 980px) {
      .layout {
        grid-template-columns: 1fr;
      }
    }
  </style>
</head>
<body>
  <div class="topbar">
    <h1>Emissão de Ofícios de Endereço</h1>
    <div class="sub">Selecione requeridos e destinatários. Depois, gere os ofícios em sequência.</div>
  </div>

  <div class="page">
    <div class="layout">
      <div class="panel">
        <div class="head">Configuração</div>
        <div class="body">
          <div class="field">
            <label for="numeroInicial">Numeração do primeiro ofício</label>
            <input id="numeroInicial" type="number" min="1" value="1" />
          </div>

          <div class="field">
            <label>Requeridos / Executados encontrados</label>
            <div id="requeridosBox" class="scroll-box"></div>
            <div class="row">
              <input id="manualReq" type="text" placeholder="Digitar requerido manualmente" />
              <button id="addManualReq" class="btn btn-light" type="button">Adicionar</button>
            </div>
          </div>

          <div class="field">
            <label for="destSearch">Pesquisar destinatários</label>
            <input id="destSearch" type="text" placeholder="Ex.: Enel, Banco, Uber, Delegacia..." />
          </div>

          <div class="field">
            <label>Destinatários</label>
            <div id="destinatariosBox" class="scroll-box"></div>
          </div>

          <div class="actions">
            <button id="btnGerar" class="btn btn-primary" type="button">Gerar ofícios</button>
            <button id="btnMarcarTodosDest" class="btn btn-light" type="button">Marcar todos</button>
            <button id="btnDesmarcarTodosDest" class="btn btn-light" type="button">Desmarcar todos</button>
          </div>

          <div id="summary" class="summary"></div>
        </div>
      </div>

      <div class="panel">
        <div class="head">Ofícios gerados</div>
        <div class="body">
          <div class="result-head">
            <div class="summary" id="resultadoInfo">Nenhum ofício gerado ainda.</div>
          </div>
          <div id="resultado" class="cards">
            <div class="empty">Os ofícios aparecerão aqui, um embaixo do outro, com botão de copiar.</div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <script>
    (() => {
      "use strict";

      let state = {
        requeridos: [],
        destinatarios: [],
        processo: "",
        hoje: "",
      };

      function escapeHtml(value) {
        return String(value ?? "")
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;")
          .replace(/'/g, "&#039;");
      }

      function norm(value) {
        return String(value || "").replace(/\\s+/g, " ").trim();
      }

      function normalizeUpper(value) {
        return String(value || "")
          .normalize("NFD")
          .replace(/[\\u0300-\\u036f]/g, "")
          .replace(/\\s+/g, " ")
          .trim()
          .toUpperCase();
      }

      function dedupeRequeridos(list) {
        const seen = new Set();
        const out = [];

        for (const item of list) {
          if (!item || !norm(item.nome)) continue;
          const key = [
            normalizeUpper(item.nome),
            normalizeUpper(item.documentoTipo || ""),
            norm(item.documentoNumero || "").replace(/\\D/g, ""),
            normalizeUpper(item.qualificacao || "")
          ].join("|");

          if (seen.has(key)) continue;
          seen.add(key);
          out.push({
            nome: norm(item.nome),
            documentoTipo: norm(item.documentoTipo || ""),
            documentoNumero: norm(item.documentoNumero || ""),
            qualificacao: norm(item.qualificacao || ""),
          });
        }

        return out;
      }

      function formatRequeridoLabel(req) {
        const nome = norm(req?.nome);
        const tipo = norm(req?.documentoTipo);
        const numero = norm(req?.documentoNumero);
        const qual = norm(req?.qualificacao);

        let text = nome;
        if (tipo && numero) text += " - " + tipo + ": " + numero;
        if (qual) text += " (" + qual + ")";
        return text;
      }

      function buildParteLinha(req) {
        const nome = norm(req?.nome);
        const tipo = norm(req?.documentoTipo);
        const numero = norm(req?.documentoNumero);
        if (tipo && numero) return "• " + nome + " - " + tipo + ": " + numero;
        return "• " + nome;
      }

      function renderRequeridos() {
        const box = document.getElementById("requeridosBox");
        box.innerHTML = "";

        if (!state.requeridos.length) {
          box.innerHTML = '<div class="item">Nenhum requerido identificado automaticamente.</div>';
          return;
        }

        state.requeridos.forEach((req, index) => {
          const label = formatRequeridoLabel(req);
          const row = document.createElement("label");
          row.className = "item";
          row.innerHTML =
            '<input type="checkbox" class="req-check" data-index="' + index + '" checked> ' +
            escapeHtml(label);
          box.appendChild(row);
        });
      }

      function renderDestinatarios(filter = "") {
        const box = document.getElementById("destinatariosBox");
        box.innerHTML = "";

        const query = norm(filter).toLowerCase();
        const itens = state.destinatarios.filter((d) => {
          const hay = (d.nome + " " + (d.email || "") + " " + (d.endereco || "")).toLowerCase();
          return !query || hay.includes(query);
        });

        if (!itens.length) {
          box.innerHTML = '<div class="item">Nenhum destinatário encontrado.</div>';
          return;
        }

        itens.forEach((dest, index) => {
          const id = "dest_" + index + "_" + Math.random().toString(36).slice(2, 8);
          const desc = dest.email
            ? dest.email
            : (dest.endereco || "Sem e-mail e sem endereço cadastrado");

          const row = document.createElement("label");
          row.className = "item";
          row.innerHTML =
            '<input type="checkbox" class="dest-check" data-nome="' + escapeHtml(dest.nome) + '" data-email="' + escapeHtml(dest.email || "") + '" data-endereco="' + escapeHtml(dest.endereco || "") + '" id="' + id + '">' +
            ' <strong>' + escapeHtml(dest.nome) + '</strong><br><span style="color:#5f6b7a;font-size:12px;">' + escapeHtml(desc) + '</span>';
          box.appendChild(row);
        });
      }

      function addManualRequerido() {
        const input = document.getElementById("manualReq");
        const value = norm(input.value);
        if (!value) return;

        state.requeridos = dedupeRequeridos([
          ...state.requeridos,
          {
            nome: value,
            documentoTipo: "",
            documentoNumero: "",
            qualificacao: "",
          }
        ]);

        input.value = "";
        renderRequeridos();
        updateSummary();
      }

      function getSelectedRequeridos() {
        return Array.from(document.querySelectorAll(".req-check:checked"))
          .map((el) => {
            const index = parseInt(el.dataset.index, 10);
            return Number.isInteger(index) ? state.requeridos[index] : null;
          })
          .filter(Boolean);
      }

      function getSelectedDestinatarios() {
        return Array.from(document.querySelectorAll(".dest-check:checked"))
          .map((el) => ({
            nome: norm(el.dataset.nome),
            email: norm(el.dataset.email),
            endereco: norm(el.dataset.endereco),
          }))
          .filter((d) => d.nome);
      }

      function updateSummary() {
        const reqs = getSelectedRequeridos();
        const dests = getSelectedDestinatarios();
        const total = reqs.length * dests.length;

        let msg = "";
        msg += "Processo: " + (state.processo || "não identificado") + ". ";
        msg += "Requeridos selecionados: " + reqs.length + ". ";
        msg += "Destinatários selecionados: " + dests.length + ". ";
        msg += "Total estimado de ofícios: " + total + ".";

        document.getElementById("summary").textContent = msg;
      }

      function formatDateLine() {
        return state.hoje || "";
      }

      function buildOficioTexto(numero, requerido, destinatario) {
        const headerDestino = destinatario.email
          ? "Ao(À) " + destinatario.nome + "\\nE-mail: " + destinatario.email
          : "Ao(À) " + destinatario.nome + "\\nEndereço: " + (destinatario.endereco || "[ENDEREÇO NÃO INFORMADO]");

        const parteLinha = buildParteLinha(requerido);

        return [
          "Ofício nº " + numero + "/2026/SEJUDPG/CVESP/JNELB",
          "",
          formatDateLine(),
          "",
          headerDestino,
          "",
          "Assunto: Solicitação de Endereço",
          "",
          "Prezados,",
          "",
          "Na qualidade de Juiz de Direito desta Unidade Judiciária, solicito a Vossa Senhoria que informe, no prazo mais breve possível, os dados cadastrais atualizados, especialmente endereço(s), telefone(s) e demais informações disponíveis, relativos a:",
          "",
          parteLinha,
          "",
          "A presente solicitação tem por finalidade possibilitar a localização da parte nos autos do processo nº " + (state.processo || "[NÚMERO DO PROCESSO]") + ".",
          "",
          "Destaco que as informações serão utilizadas exclusivamente para fins processuais.",
          "",
          "Sem mais para o momento, renovo votos de elevada estima e consideração.",
          "",
          "Atenciosamente,",
          "",
          "Juiz(a) de Direito",
        ].join("\\n");
      }

      async function copyText(text) {
        try {
          await navigator.clipboard.writeText(text);
          return true;
        } catch (_) {
          try {
            const ta = document.createElement("textarea");
            ta.value = text;
            ta.style.position = "fixed";
            ta.style.left = "-9999px";
            ta.style.top = "0";
            document.body.appendChild(ta);
            ta.focus();
            ta.select();
            const ok = document.execCommand("copy");
            ta.remove();
            return ok;
          } catch (_) {
            return false;
          }
        }
      }

      function generateOficios() {
        const numeroInicial = parseInt(document.getElementById("numeroInicial").value, 10) || 1;
        const requeridos = getSelectedRequeridos();
        const destinatarios = getSelectedDestinatarios();
        const resultado = document.getElementById("resultado");
        const info = document.getElementById("resultadoInfo");

        if (!requeridos.length) {
          alert("Selecione ao menos um requerido.");
          return;
        }

        if (!destinatarios.length) {
          alert("Selecione ao menos um destinatário.");
          return;
        }

        resultado.innerHTML = "";
        let contador = numeroInicial;
        let total = 0;

        for (const dest of destinatarios) {
          for (const req of requeridos) {
            const texto = buildOficioTexto(contador, req, dest);
            const card = document.createElement("div");
            card.className = "oficio-card";

            const toolbar = document.createElement("div");
            toolbar.className = "oficio-toolbar";

            const titleWrap = document.createElement("div");
            titleWrap.innerHTML =
              '<div class="oficio-title">Ofício nº ' + contador + '/2026/SEJUDPG/CVESP/JNELB</div>' +
              '<div class="oficio-meta">' + escapeHtml(dest.nome) + ' • ' + escapeHtml(formatRequeridoLabel(req)) + '</div>';

            const btn = document.createElement("button");
            btn.type = "button";
            btn.className = "btn btn-primary";
            btn.textContent = "Copiar";

            btn.addEventListener("click", async () => {
              const ok = await copyText(texto);
              if (ok) {
                btn.textContent = "Copiado";
                btn.classList.remove("btn-primary");
                btn.classList.add("btn-success");
              } else {
                btn.textContent = "Falhou";
                btn.classList.remove("btn-primary");
                btn.classList.add("btn-danger");
              }
            });

            toolbar.appendChild(titleWrap);
            toolbar.appendChild(btn);

            const body = document.createElement("div");
            body.className = "oficio-body";

            const pre = document.createElement("pre");
            pre.className = "oficio-pre";
            pre.textContent = texto;

            body.appendChild(pre);
            card.appendChild(toolbar);
            card.appendChild(body);
            resultado.appendChild(card);

            contador++;
            total++;
          }
        }

        info.textContent = total + " ofício(s) gerado(s).";
      }

      function bindEvents() {
        if (window.__oficiosBindDone) return;
        window.__oficiosBindDone = true;

        document.getElementById("addManualReq").addEventListener("click", addManualRequerido);

        document.getElementById("manualReq").addEventListener("keydown", (e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            addManualRequerido();
          }
        });

        document.getElementById("destSearch").addEventListener("input", (e) => {
          renderDestinatarios(e.target.value);
          updateSummary();
        });

        document.getElementById("btnGerar").addEventListener("click", generateOficios);

        document.getElementById("btnMarcarTodosDest").addEventListener("click", () => {
          document.querySelectorAll(".dest-check").forEach((el) => { el.checked = true; });
          updateSummary();
        });

        document.getElementById("btnDesmarcarTodosDest").addEventListener("click", () => {
          document.querySelectorAll(".dest-check").forEach((el) => { el.checked = false; });
          updateSummary();
        });

        document.addEventListener("change", (e) => {
          if (e.target && (e.target.classList.contains("req-check") || e.target.classList.contains("dest-check"))) {
            updateSummary();
          }
        });
      }

      window.renderOficiosApp = function renderOficiosApp(payload) {
        state = {
          requeridos: Array.isArray(payload?.requeridos) ? payload.requeridos : [],
          destinatarios: Array.isArray(payload?.destinatarios) ? payload.destinatarios : [],
          processo: payload?.processo || "",
          hoje: payload?.hoje || "",
        };

        renderRequeridos();
        renderDestinatarios();
        bindEvents();
        updateSummary();
      };
    })();
  <\/script>
</body>
</html>`;
  }

  function extractNumeroProcesso() {
    const bodyText = document.body?.innerText || "";
    const match = bodyText.match(/\b\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}\b/);
    return match ? match[0] : "";
  }

  function extractRequeridosFromPage() {
    const fromPoloPassivo = extractFromPoloPassivo();
    if (fromPoloPassivo.length) return fromPoloPassivo;

    return extractFallbackFromText();
  }

  function extractFromPoloPassivo() {
    const root = document.querySelector("#poloPassivo");
    if (!root) return [];

    const rows = Array.from(root.querySelectorAll("tbody tr td"));
    const result = [];

    for (const cell of rows) {
      const text = getCleanCellText(cell);
      if (!text) continue;

      const parsed = parseParteText(text);
      if (parsed) {
        result.push(parsed);
      } else {
        result.push({
          nome: text,
          documentoTipo: "",
          documentoNumero: "",
          qualificacao: "",
        });
      }
    }

    return dedupeStringsAsObjects(result);
  }

  function getCleanCellText(cell) {
    if (!cell) return "";

    const clone = cell.cloneNode(true);
    clone.querySelectorAll("i, svg, button").forEach((el) => el.remove());

    return String(clone.textContent || "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function parseParteText(text) {
    const clean = String(text || "").replace(/\s+/g, " ").trim();
    if (!clean) return null;

    const fullMatch = clean.match(/^(.*?)\s*-\s*(CPF|CNPJ):\s*([\d./-]+)\s*\((.*?)\)\s*$/i);
    if (fullMatch) {
      return {
        nome: fullMatch[1].trim(),
        documentoTipo: fullMatch[2].toUpperCase(),
        documentoNumero: fullMatch[3].trim(),
        qualificacao: fullMatch[4].trim().toUpperCase(),
      };
    }

    const docNoQual = clean.match(/^(.*?)\s*-\s*(CPF|CNPJ):\s*([\d./-]+)\s*$/i);
    if (docNoQual) {
      return {
        nome: docNoQual[1].trim(),
        documentoTipo: docNoQual[2].toUpperCase(),
        documentoNumero: docNoQual[3].trim(),
        qualificacao: "",
      };
    }

    const qualNoDoc = clean.match(/^(.*?)\s*\((.*?)\)\s*$/i);
    if (qualNoDoc) {
      return {
        nome: qualNoDoc[1].trim(),
        documentoTipo: "",
        documentoNumero: "",
        qualificacao: qualNoDoc[2].trim().toUpperCase(),
      };
    }

    return {
      nome: clean,
      documentoTipo: "",
      documentoNumero: "",
      qualificacao: "",
    };
  }

  function dedupeStringsAsObjects(list) {
    const seen = new Set();
    const out = [];

    for (const item of list) {
      if (!item || !item.nome) continue;
      const key = [
        normalizeUpper(item.nome),
        normalizeUpper(item.documentoTipo || ""),
        String(item.documentoNumero || "").replace(/\D/g, ""),
        normalizeUpper(item.qualificacao || "")
      ].join("|");

      if (seen.has(key)) continue;
      seen.add(key);
      out.push(item);
    }

    return out;
  }

  function extractFallbackFromText() {
    const text = document.body?.innerText || "";
    const lines = text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    const labels = [
      "REQUERIDO:",
      "REQUERIDOS:",
      "EXECUTADO:",
      "EXECUTADOS:",
      "PROMOVIDO:",
      "PROMOVIDOS:",
      "RÉU:",
      "RÉUS:",
      "REU:",
      "REUS:",
    ];

    const encontrados = [];

    for (let i = 0; i < lines.length; i++) {
      const lineUpper = normalizeUpper(lines[i]);

      for (const label of labels) {
        if (lineUpper.startsWith(label)) {
          const raw = lines[i].slice(label.length).trim();
          if (raw) {
            splitNames(raw).forEach((n) => {
              encontrados.push({
                nome: n,
                documentoTipo: "",
                documentoNumero: "",
                qualificacao: "",
              });
            });
          }

          const next = lines[i + 1] || "";
          if (next && !looksLikeStructuralLine(next)) {
            splitNames(next).forEach((n) => {
              encontrados.push({
                nome: n,
                documentoTipo: "",
                documentoNumero: "",
                qualificacao: "",
              });
            });
          }
        }
      }
    }

    return dedupeStringsAsObjects(encontrados).slice(0, 20);
  }

  function splitNames(value) {
    return String(value || "")
      .split(/\s{2,}|;|,(?=\s*[A-ZÁÉÍÓÚÂÊÔÃÕÇ])/)
      .map((part) => part.trim())
      .filter((part) => {
        if (!part) return false;
        if (part.length < 3) return false;
        if (/^\[.*\]$/.test(part)) return false;
        return true;
      });
  }

  function looksLikeStructuralLine(value) {
    const v = normalizeUpper(value);
    if (!v) return true;
    return [
      "PROCESSO:",
      "CLASSE:",
      "ASSUNTO:",
      "EXEQUENTE:",
      "REQUERENTE:",
      "AUTOR:",
      "MAGISTRADO:",
      "PODER JUDICIÁRIO",
      "PODER JUDICIARIO",
      "TELEFONE:",
      "E-MAIL:",
    ].some((prefix) => v.startsWith(prefix));
  }

  function normalizeUpper(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .toUpperCase();
  }

  function formatDateUpper(date) {
    const meses = [
      "janeiro", "fevereiro", "março", "abril", "maio", "junho",
      "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
    ];
    const d = String(date.getDate()).padStart(2, "0");
    const m = meses[date.getMonth()];
    const y = date.getFullYear();
    return "FORTALEZA, " + d + " de " + m + " de " + y + ".";
  }
})();
