// ==UserScript==
// @name         PJe TJCE - CTRL+Click consultar ID e abrir item da cronologia
// @namespace    melhorias-pje.ctrlclick-consultar-id-cronologia
// @version      2.0.0
// @description  CTRL+Click no link do ID pesquisa na cronologia, clica no item encontrado, limpa a pesquisa e pesquisa novamente vazio.
// @author       Nigério Bezerra
// @match        https://pje.tjce.jus.br/pje1grau/*
// @match        https://pje-treinamento-release.tjce.jus.br/pje1grau/*
// @run-at       document-idle
// ==/UserScript==

(function () {
  "use strict";

  const LINK_SELECTOR = "a.referencia_unificada";
  const INPUT_SELECTOR =
    '#divTimeLine > .pesquisa.affix-top > .input-group > input[id="divTimeLine:txtPesquisa"]';
  const BUTTON_SELECTOR =
    '#divTimeLine > .pesquisa.affix-top > .input-group > .input-group-btn > a[id="divTimeLine:btnPesquisar"]';
  const TIMELINE_ROOT_SELECTOR = '#divTimeLine\\:eventosTimeLineElement';

  const DEBUG = false;
  const SEARCH_WAIT_MS = 1200;
  const CLEAR_WAIT_MS = 600;
  const FIND_TIMEOUT_MS = 8000;
  const FIND_INTERVAL_MS = 250;

  function log(...args) {
    if (DEBUG) console.log("[PJe Consulta Cronologia]", ...args);
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function norm(text) {
    return String(text || "").replace(/\s+/g, " ").trim();
  }

  function extractId(link) {
    const text = norm(link.textContent);
    return /^\d+$/.test(text) ? text : "";
  }

  function getTopWindow() {
    try {
      return window.top || window;
    } catch {
      return window;
    }
  }

  function getTopDocument() {
    try {
      return window.top.document || document;
    } catch {
      return document;
    }
  }

  function setNativeValue(input, value) {
    const proto = Object.getPrototypeOf(input);
    const desc = Object.getOwnPropertyDescriptor(proto, "value");
    if (desc && typeof desc.set === "function") {
      desc.set.call(input, value);
    } else {
      input.value = value;
    }
  }

  function fireInputEvents(input) {
    input.dispatchEvent(new Event("focus", { bubbles: true }));
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    input.dispatchEvent(new Event("blur", { bubbles: true }));
  }

  function clickSearchButton(topWin, button) {
    try {
      button.click();
      return true;
    } catch (err) {
      log("Falha no button.click()", err);
    }

    try {
      if (topWin.A4J && topWin.A4J.AJAX && typeof topWin.A4J.AJAX.Submit === "function") {
        topWin.A4J.AJAX.Submit("divTimeLine", null, {
          similarityGroupingId: "divTimeLine:btnPesquisar",
          onbeforedomupdate: function () {
            if (typeof topWin.limparTimeline === "function") {
              topWin.limparTimeline();
            }
          },
          oncomplete: function () {
            if (typeof topWin.bindPaginacaoInfinita === "function") {
              topWin.bindPaginacaoInfinita(true);
            }
          },
          parameters: {
            "divTimeLine:btnPesquisar": "divTimeLine:btnPesquisar",
            ajaxSingle: "divTimeLine:btnPesquisar"
          },
          status: "_viewRoot:status"
        });
        return true;
      }
    } catch (err) {
      log("Falha no A4J direto", err);
    }

    return false;
  }

  function getSearchElements() {
    const topWin = getTopWindow();
    const topDoc = getTopDocument();

    const input = topDoc.querySelector(INPUT_SELECTOR);
    const button = topDoc.querySelector(BUTTON_SELECTOR);
    const timelineRoot = topDoc.querySelector(TIMELINE_ROOT_SELECTOR);

    return { topWin, topDoc, input, button, timelineRoot };
  }

  function runSearch(topWin, input, button, value) {
    setNativeValue(input, value);
    fireInputEvents(input);
    return clickSearchButton(topWin, button);
  }

  function findMatchingTimelineLinks(topDoc, id) {
    const root = topDoc.querySelector(TIMELINE_ROOT_SELECTOR);
    if (!root) return [];

    const links = Array.from(root.querySelectorAll("a"));
    return links.filter((a) => {
      const text = norm(a.textContent);
      return text.startsWith(id + " -") || text.startsWith(id + " –");
    });
  }

  async function waitForMatchingTimelineLink(topDoc, id, timeoutMs) {
    const startedAt = Date.now();

    while (Date.now() - startedAt < timeoutMs) {
      const matches = findMatchingTimelineLinks(topDoc, id);
      if (matches.length) {
        return matches[matches.length - 1];
      }
      await sleep(FIND_INTERVAL_MS);
    }

    return null;
  }

  function clickElement(el) {
    if (!el) return false;

    try {
      el.click();
      return true;
    } catch (err) {
      log("Falha no click() do item", err);
    }

    try {
      const evt = new MouseEvent("click", {
        bubbles: true,
        cancelable: true
      });
      el.dispatchEvent(evt);
      return true;
    } catch (err) {
      log("Falha no dispatchEvent do item", err);
    }

    return false;
  }

  async function runFullFlow(id) {
    const { topWin, topDoc, input, button } = getSearchElements();

    log("ID:", id);
    log("Input:", input);
    log("Botão:", button);

    if (!input || !button) {
      log("Input ou botão não encontrados.");
      return;
    }

    const searchOk = runSearch(topWin, input, button, id);
    log("Pesquisa inicial acionada?", searchOk);

    await sleep(SEARCH_WAIT_MS);

    const target = await waitForMatchingTimelineLink(topDoc, id, FIND_TIMEOUT_MS);
    log("Item encontrado?", target);

    if (target) {
      clickElement(target);
      log("Clique no item executado.");
    } else {
      log("Nenhum item da cronologia encontrado para o ID.");
    }

    await sleep(CLEAR_WAIT_MS);

    runSearch(topWin, input, button, "");
    log("Pesquisa limpa executada.");
  }

  document.addEventListener(
    "click",
    (event) => {
      const link = event.target.closest(LINK_SELECTOR);
      if (!link) return;
      if (!event.ctrlKey) return;

      event.preventDefault();
      event.stopPropagation();
      if (typeof event.stopImmediatePropagation === "function") {
        event.stopImmediatePropagation();
      }

      const id = extractId(link);
      if (!id) return;

      runFullFlow(id).catch((err) => {
        console.error("[PJe Consulta Cronologia] Erro no fluxo:", err);
      });
    },
    true
  );
})();
