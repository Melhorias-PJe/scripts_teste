// ==UserScript==
// @name         PJe TJCE - Painel de Administração e Diagnóstico (Alt+0)
// @namespace    local.tjce.pje.diagnostico
// @version      1.3.3
// @description  Abre um painel de diagnóstico com Alt+0 para erros, logs, mutações, storage e depuração de seletores no PJe.
// @match        https://pje.tjce.jus.br/pje1grau/*
// @match        https://pje-treinamento-release.tjce.jus.br/pje1grau/*
// @run-at       document-start
// @grant        GM_setClipboard
// ==/UserScript==

(function () {
  "use strict";

  const SCRIPT_ID = "pjeDiagPanelInstalled";
  if (document.documentElement.dataset[SCRIPT_ID] === "1") return;
  document.documentElement.dataset[SCRIPT_ID] = "1";

  const CONFIG = {
    WINDOW_NAME: "pje-health-diagnostic-window",
    WINDOW_FEATURES: "width=1360,height=920,resizable=yes,scrollbars=yes",
    MAX_LOGS: 300,
    MAX_ERRORS: 150,
    MAX_EVENTS: 400,
    MAX_MUTATIONS_SAMPLES: 120,
    RENDER_INTERVAL_MS: 700,
    RECENT_EVENT_LIMIT: 120,
    DOM_SNIPPET_MAX: 2500,
    ANCESTOR_DEPTH: 6,
    TEST_SELECTOR_LIMIT: 100,
    STORAGE_TEST_KEY: "__pje_diag_storage_test__",
  };

  const State = {
    startedAt: Date.now(),
    dashboardWindow: null,
    renderTimer: null,
    observersInstalled: false,
    errorsPatched: false,
    consolePatched: false,
    fetchPatched: false,
    xhrPatched: false,
    lastRenderAt: 0,
    mutationCount: 0,
    lastMutationAt: 0,
    lastUserInteractionAt: 0,
    mutationsLastSecond: 0,
    mutationSeries: [],
    logs: [],
    events: [],
    errors: [],
    selectorRuns: [],
    network: [],
    expandedErrors: new Set(),
    expandedCardId: null,
    storageDiagnostics: {
      localStorage: null,
      sessionStorage: null,
      lastRunAt: null,
    },
    timers: {
      secondTicker: null,
    },
  };

  const U = {
    iso(ts = Date.now()) {
      try {
        return new Date(ts).toISOString();
      } catch (_) {
        return String(ts);
      }
    },

    fmtMs(ms) {
      if (!Number.isFinite(ms)) return "-";
      if (ms < 1000) return `${ms}ms`;
      const s = Math.floor(ms / 1000);
      const rem = ms % 1000;
      if (s < 60) return `${s}s ${rem}ms`;
      const m = Math.floor(s / 60);
      const ss = s % 60;
      if (m < 60) return `${m}m ${ss}s`;
      const h = Math.floor(m / 60);
      const mm = m % 60;
      return `${h}h ${mm}m ${ss}s`;
    },

    safeString(value, fallback = "") {
      try {
        if (value == null) return fallback;
        if (typeof value === "string") return value;
        if (typeof value === "number" || typeof value === "boolean") return String(value);
        if (value instanceof Error) return `${value.name}: ${value.message}`;
        return JSON.stringify(value, U.jsonReplacer, 2);
      } catch (_) {
        try {
          return String(value);
        } catch (_) {
          return fallback;
        }
      }
    },

    jsonReplacer(key, value) {
      if (value instanceof Node) return U.describeNode(value);
      if (value instanceof Error) {
        return {
          name: value.name,
          message: value.message,
          stack: value.stack,
        };
      }
      if (typeof value === "function") return `[Function ${value.name || "anonymous"}]`;
      if (value instanceof Window) return "[Window]";
      if (value instanceof Document) return "[Document]";
      return value;
    },

    normalizeText(text) {
      return String(text || "").replace(/\s+/g, " ").trim();
    },

    clip(text, max = 300) {
      const s = String(text || "");
      return s.length > max ? `${s.slice(0, max)}...` : s;
    },

    nodePath(node) {
      if (!node || !(node instanceof Element)) return "";
      const parts = [];
      let cur = node;
      let depth = 0;

      while (cur && cur.nodeType === 1 && depth < 8) {
        let part = cur.tagName.toLowerCase();

        if (cur.id) {
          part += `#${CSS.escape(cur.id)}`;
          parts.unshift(part);
          break;
        }

        if (cur.classList && cur.classList.length) {
          part += "." + Array.from(cur.classList)
            .slice(0, 3)
            .map((c) => CSS.escape(c))
            .join(".");
        }

        const parent = cur.parentElement;
        if (parent) {
          const siblings = Array.from(parent.children).filter((el) => el.tagName === cur.tagName);
          if (siblings.length > 1) {
            const index = siblings.indexOf(cur) + 1;
            part += `:nth-of-type(${index})`;
          }
        }

        parts.unshift(part);
        cur = cur.parentElement;
        depth += 1;
      }

      return parts.join(" > ");
    },

    describeNode(node) {
      if (!node) return null;
      try {
        if (!(node instanceof Element)) {
          return {
            type: node?.nodeType,
            text: U.clip(node?.textContent || "", 180),
          };
        }

        return {
          tag: node.tagName?.toLowerCase() || null,
          id: node.id || null,
          name: node.getAttribute("name"),
          className: node.className || null,
          role: node.getAttribute("role"),
          type: node.getAttribute("type"),
          value: typeof node.value === "string" ? U.clip(node.value, 150) : null,
          text: U.clip(U.normalizeText(node.textContent || ""), 220),
          path: U.nodePath(node),
        };
      } catch (error) {
        return { error: String(error?.message || error) };
      }
    },

    safeOuterHTML(node, max = CONFIG.DOM_SNIPPET_MAX) {
      try {
        if (!node || !(node instanceof Element)) return "";
        const html = node.outerHTML || "";
        return html.length > max ? html.slice(0, max) + "\n<!-- cortado -->" : html;
      } catch (error) {
        return `[[erro ao capturar outerHTML: ${error?.message || error}]]`;
      }
    },

    collectAncestors(node, depth = CONFIG.ANCESTOR_DEPTH) {
      const items = [];
      let cur = node instanceof Element ? node : node?.parentElement;
      let i = 0;

      while (cur && i < depth) {
        items.push({
          level: i,
          node: U.describeNode(cur),
          html: U.safeOuterHTML(cur, 800),
        });
        cur = cur.parentElement;
        i += 1;
      }

      return items;
    },

    copyText(text) {
      try {
        if (typeof GM_setClipboard === "function") {
          GM_setClipboard(String(text || ""), "text");
          return true;
        }
      } catch (_) {}

      try {
        navigator.clipboard?.writeText?.(String(text || ""));
        return true;
      } catch (_) {}

      return false;
    },

    pushLimited(arr, item, max) {
      arr.push(item);
      if (arr.length > max) arr.splice(0, arr.length - max);
    },

    runtimeGlobals() {
      return {
        getActiveCatalog: typeof window.getActiveCatalog === "function",
        getSelectorEntry: typeof window.getSelectorEntry === "function",
        debugSelectorResolution: typeof window.debugSelectorResolution === "function",
        queryByCatalog: typeof window.queryByCatalog === "function",
        queryAllByCatalog: typeof window.queryAllByCatalog === "function",
        state: !!window.state,
        Scheduler: !!window.Scheduler,
        SchedulerAPI: !!window.SchedulerAPI,
        ModVerificacaoFinal: !!window.ModVerificacaoFinal,
        Toast: !!window.Toast,
      };
    },
  };

  function addEvent(type, detail = {}, level = "info") {
    U.pushLimited(
      State.events,
      {
        id: `ev-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        ts: Date.now(),
        type,
        level,
        detail,
      },
      CONFIG.MAX_EVENTS
    );
  }

  function addLog(level, args, source = "console") {
    U.pushLimited(
      State.logs,
      {
        id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        ts: Date.now(),
        level,
        source,
        message: args.map((v) => U.safeString(v)).join(" "),
        raw: args.map((v) => U.safeString(v)),
      },
      CONFIG.MAX_LOGS
    );
  }

  function buildErrorRecord(kind, payload = {}) {
    const active = document.activeElement;
    return {
      id: `err-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      ts: Date.now(),
      kind,
      name: payload.name || null,
      message: payload.message || null,
      stack: payload.stack || null,
      file: payload.file || null,
      line: payload.line || null,
      column: payload.column || null,
      cause: payload.cause || null,
      severity: payload.severity || "error",
      module: payload.module || null,
      phase: payload.phase || null,
      selectorPath: payload.selectorPath || null,
      selector: payload.selector || null,
      context: payload.context || null,
      url: location.href,
      hash: location.hash,
      title: document.title,
      readyState: document.readyState,
      activeElement: U.describeNode(active),
      activeElementHtml: U.safeOuterHTML(active instanceof Element ? active : null, 1200),
      mutationCount: State.mutationCount,
      lastMutationAt: State.lastMutationAt,
      uptimeMs: Date.now() - State.startedAt,
    };
  }

  function addError(kind, payload = {}) {
    const rec = buildErrorRecord(kind, payload);
    U.pushLimited(State.errors, rec, CONFIG.MAX_ERRORS);
    addEvent(
      "error-captured",
      {
        kind,
        message: rec.message,
        module: rec.module,
        phase: rec.phase,
        selectorPath: rec.selectorPath,
      },
      "error"
    );
    return rec;
  }

  function testStorage(storageName) {
    const startedAt = Date.now();
    const key = `${CONFIG.STORAGE_TEST_KEY}:${storageName}:${location.origin}`;
    const payload = {
      ts: Date.now(),
      origin: location.origin,
      href: location.href,
      random: Math.random().toString(36).slice(2),
    };

    const result = {
      storageName,
      ok: false,
      available: false,
      writeOk: false,
      readOk: false,
      removeOk: false,
      persistedValueMatches: false,
      existingLength: null,
      durationMs: 0,
      valueWritten: null,
      valueRead: null,
      error: null,
    };

    try {
      const storage = window[storageName];
      result.available = !!storage;

      if (!storage) {
        throw new Error(`${storageName} não está disponível no window.`);
      }

      result.existingLength = storage.length;

      const serialized = JSON.stringify(payload);
      result.valueWritten = serialized;

      storage.setItem(key, serialized);
      result.writeOk = true;

      const readBack = storage.getItem(key);
      result.valueRead = readBack;
      result.readOk = readBack !== null;
      result.persistedValueMatches = readBack === serialized;

      storage.removeItem(key);
      result.removeOk = storage.getItem(key) === null;

      result.ok =
        result.available &&
        result.writeOk &&
        result.readOk &&
        result.persistedValueMatches &&
        result.removeOk;
    } catch (error) {
      result.error = {
        name: error?.name || "StorageError",
        message: error?.message || String(error),
        stack: error?.stack || null,
      };
    }

    result.durationMs = Date.now() - startedAt;
    return result;
  }

  function refreshStorageDiagnostics() {
    const local = testStorage("localStorage");
    const session = testStorage("sessionStorage");

    State.storageDiagnostics = {
      localStorage: local,
      sessionStorage: session,
      lastRunAt: Date.now(),
    };

    addEvent(
      "storage-diagnostics",
      {
        localStorageOk: local.ok,
        sessionStorageOk: session.ok,
      },
      !local.ok || !session.ok ? "warn" : "info"
    );

    if (!local.ok) {
      addError("localstorage-test-failed", {
        name: local.error?.name || "LocalStorageTestFailed",
        message: local.error?.message || "Falha no teste de localStorage.",
        phase: "storage-diagnostics",
        context: local,
      });
    }

    if (!session.ok) {
      addError("sessionstorage-test-failed", {
        name: session.error?.name || "SessionStorageTestFailed",
        message: session.error?.message || "Falha no teste de sessionStorage.",
        phase: "storage-diagnostics",
        context: session,
      });
    }
  }

  function patchGlobalErrors() {
    if (State.errorsPatched) return;
    State.errorsPatched = true;

    window.addEventListener(
      "error",
      (event) => {
        const error = event.error;
        addError("window.error", {
          name: error?.name || "Error",
          message: error?.message || event.message || "Erro não identificado",
          stack: error?.stack || null,
          file: event.filename || null,
          line: event.lineno || null,
          column: event.colno || null,
          cause: error?.cause ? U.safeString(error.cause) : null,
        });
      },
      true
    );

    window.addEventListener("unhandledrejection", (event) => {
      const reason = event.reason;
      addError("unhandledrejection", {
        name: reason?.name || "UnhandledPromiseRejection",
        message: reason?.message || U.safeString(reason, "Promise rejeitada sem detalhe"),
        stack: reason?.stack || null,
        cause: reason?.cause ? U.safeString(reason.cause) : null,
      });
    });

    const origOnError = window.onerror;
    window.onerror = function (...args) {
      try {
        const [message, source, lineno, colno, error] = args;
        addError("window.onerror", {
          name: error?.name || "Error",
          message: error?.message || message || "window.onerror",
          stack: error?.stack || null,
          file: source || null,
          line: lineno || null,
          column: colno || null,
        });
      } catch (_) {}

      if (typeof origOnError === "function") {
        return origOnError.apply(this, args);
      }

      return false;
    };
  }

  function patchConsole() {
    if (State.consolePatched) return;
    State.consolePatched = true;

    const methods = ["log", "info", "warn", "error", "debug"];

    methods.forEach((method) => {
      const original = console[method];
      if (typeof original !== "function") return;

      console[method] = function (...args) {
        try {
          addLog(method, args, "console");
          if (method === "warn" || method === "error") {
            addEvent(
              "console-" + method,
              {
                message: args.map((v) => U.safeString(v)).join(" "),
              },
              method === "error" ? "error" : "warn"
            );
          }
        } catch (_) {}

        return original.apply(this, args);
      };
    });
  }

  function patchFetch() {
    if (State.fetchPatched) return;
    State.fetchPatched = true;
    if (typeof window.fetch !== "function") return;

    const originalFetch = window.fetch;

    window.fetch = async function (...args) {
      const startedAt = Date.now();
      const url = (() => {
        try {
          const a0 = args[0];
          if (typeof a0 === "string") return a0;
          if (a0 && typeof a0.url === "string") return a0.url;
        } catch (_) {}
        return "[fetch]";
      })();

      addEvent("fetch-start", { url });

      try {
        const response = await originalFetch.apply(this, args);

        U.pushLimited(
          State.network,
          {
            id: `net-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            ts: Date.now(),
            type: "fetch",
            url,
            ok: response.ok,
            status: response.status,
            statusText: response.statusText,
            durationMs: Date.now() - startedAt,
          },
          120
        );

        if (!response.ok) {
          addError("fetch-non-ok", {
            name: "FetchError",
            message: `HTTP ${response.status} ${response.statusText} em ${url}`,
            context: { url, status: response.status, statusText: response.statusText },
          });
        }

        return response;
      } catch (error) {
        addError("fetch-exception", {
          name: error?.name || "FetchError",
          message: error?.message || `Falha em fetch ${url}`,
          stack: error?.stack || null,
          context: { url },
        });
        throw error;
      }
    };
  }

  function patchXHR() {
    if (State.xhrPatched) return;
    State.xhrPatched = true;
    if (typeof XMLHttpRequest === "undefined") return;

    const proto = XMLHttpRequest.prototype;
    const origOpen = proto.open;
    const origSend = proto.send;

    proto.open = function (method, url, ...rest) {
      this.__pjeDiagMeta = {
        method,
        url,
        openedAt: Date.now(),
      };
      return origOpen.call(this, method, url, ...rest);
    };

    proto.send = function (...args) {
      const meta = this.__pjeDiagMeta || { method: "GET", url: "[xhr]", openedAt: Date.now() };

      const finalize = () => {
        U.pushLimited(
          State.network,
          {
            id: `net-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            ts: Date.now(),
            type: "xhr",
            url: meta.url,
            method: meta.method,
            status: this.status,
            readyState: this.readyState,
            durationMs: Date.now() - meta.openedAt,
          },
          120
        );

        if (this.status >= 400) {
          addError("xhr-non-ok", {
            name: "XHRError",
            message: `HTTP ${this.status} em ${meta.method} ${meta.url}`,
            context: { url: meta.url, method: meta.method, status: this.status },
          });
        }
      };

      this.addEventListener("loadend", finalize, { once: true });

      this.addEventListener(
        "error",
        () => {
          addError("xhr-exception", {
            name: "XHRError",
            message: `Falha em ${meta.method} ${meta.url}`,
            context: { url: meta.url, method: meta.method },
          });
        },
        { once: true }
      );

      return origSend.apply(this, args);
    };
  }

  function installMutationObserver() {
    if (State.observersInstalled) return;
    State.observersInstalled = true;

    const mo = new MutationObserver((mutations) => {
      State.mutationCount += mutations.length;
      State.lastMutationAt = Date.now();
      State.mutationsLastSecond += mutations.length;

      const interesting = mutations.slice(0, 3).map((m) => ({
        type: m.type,
        target: U.describeNode(m.target),
        added: m.addedNodes?.length || 0,
        removed: m.removedNodes?.length || 0,
        attributeName: m.attributeName || null,
      }));

      addEvent(
        "dom-mutation",
        {
          count: mutations.length,
          sample: interesting,
        },
        "debug"
      );
    });

    mo.observe(document.documentElement || document, {
      childList: true,
      subtree: true,
      attributes: true,
      characterData: false,
    });

    window.addEventListener(
      "click",
      () => {
        State.lastUserInteractionAt = Date.now();
      },
      true
    );

    window.addEventListener(
      "keydown",
      () => {
        State.lastUserInteractionAt = Date.now();
      },
      true
    );

    State.timers.secondTicker = setInterval(() => {
      U.pushLimited(
        State.mutationSeries,
        {
          ts: Date.now(),
          value: State.mutationsLastSecond,
        },
        CONFIG.MAX_MUTATIONS_SAMPLES
      );
      State.mutationsLastSecond = 0;
    }, 1000);
  }

  function toggleCardExpand(cardId) {
    if (!cardId) return;
    State.expandedCardId = State.expandedCardId === cardId ? null : cardId;
    renderDashboard(true);
  }

  function applyExpandedCardState(win) {
    const doc = win.document;
    const container = doc.getElementById("dashboard-container");
    if (!container) return;

    const cards = Array.from(doc.querySelectorAll(".card[data-card-id]"));
    const expandedId = State.expandedCardId;

    cards.forEach((card) => {
      const cardId = card.getAttribute("data-card-id");
      const isExpanded = expandedId && cardId === expandedId;

      card.classList.toggle("is-expanded", !!isExpanded);

      if (expandedId) {
        card.style.display = isExpanded ? "" : "none";
      } else {
        card.style.display = "";
      }
    });

    container.classList.toggle("has-expanded", !!expandedId);

    doc.querySelectorAll("[data-toggle-card]").forEach((btn) => {
      const cardId = btn.getAttribute("data-toggle-card");
      const isExpanded = expandedId === cardId;
      btn.textContent = isExpanded ? "❐" : "□";
      btn.title = isExpanded ? "Restaurar" : "Maximizar";
    });

    if (expandedId) {
      const expandedCard = doc.querySelector(`.card[data-card-id="${CSS.escape(expandedId)}"]`);
      if (expandedCard) {
        const topbar = doc.querySelector(".topbar");
        const topbarHeight = topbar ? topbar.getBoundingClientRect().height : 80;
        const cardHeader = expandedCard.querySelector(".card-header");
        if (cardHeader) {
          cardHeader.style.top = `${topbarHeight}px`;
        }
      }
    } else {
      doc.querySelectorAll(".card .card-header").forEach((header) => {
        header.style.top = "";
      });
    }
  }

  function openDashboard() {
    if (State.dashboardWindow && !State.dashboardWindow.closed) {
      State.dashboardWindow.focus();
      renderDashboard(true);
      return;
    }

    const win = window.open("", CONFIG.WINDOW_NAME, CONFIG.WINDOW_FEATURES);
    if (!win) {
      addError("dashboard-open-failed", {
        name: "PopupBlocked",
        message: "A janela do painel foi bloqueada pelo navegador.",
      });
      return;
    }

    State.dashboardWindow = win;
    bootstrapDashboardHTML(win);
    refreshStorageDiagnostics();
    renderDashboard(true);

    if (State.renderTimer) clearInterval(State.renderTimer);
    State.renderTimer = setInterval(() => {
      if (!State.dashboardWindow || State.dashboardWindow.closed) {
        clearInterval(State.renderTimer);
        State.renderTimer = null;
        return;
      }
      renderDashboard();
    }, CONFIG.RENDER_INTERVAL_MS);
  }

  function bootstrapDashboardHTML(win) {
    const html = `
<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <title>PJe Diagnóstico</title>
  <style>
    :root {
      --bg: #0f1115;
      --panel: #171a21;
      --panel2: #1f2430;
      --text: #e7ecf3;
      --muted: #9aa7b8;
      --ok: #3ecf8e;
      --warn: #f5b942;
      --err: #ff6b6b;
      --border: #2a3242;
      --blue: #5aa9ff;
      --mono: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      --sans: Inter, Segoe UI, Arial, sans-serif;
    }

    * {
      box-sizing: border-box;
      min-width: 0;
    }

    html, body {
      margin: 0;
      min-height: 100%;
      background: var(--bg);
      color: var(--text);
      font-family: var(--sans);
    }

    body {
      overflow-y: auto;
      overflow-x: hidden;
    }

    .topbar {
      position: sticky;
      top: 0;
      z-index: 100;
      background: #0c0f14;
      border-bottom: 1px solid var(--border);
      padding: 12px 16px;
    }

    .topbar h1 {
      margin: 0;
      font-size: 18px;
      overflow-wrap: anywhere;
    }

    .topbar .sub {
      margin-top: 4px;
      color: var(--muted);
      font-size: 12px;
      overflow-wrap: anywhere;
    }

    .toolbar {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-top: 10px;
    }

    button, input, select, textarea {
      font: inherit;
    }

    button {
      background: var(--panel2);
      color: var(--text);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 8px 10px;
      cursor: pointer;
      max-width: 100%;
    }

    button:hover {
      border-color: var(--blue);
    }

    .container {
      padding: 14px;
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 14px;
      align-items: start;
      transition: all .22s ease;
    }

    .card {
      background: var(--panel);
      border: 1px solid var(--border);
      border-radius: 12px;
      overflow: visible;
      transition:
        transform .2s ease,
        box-shadow .2s ease,
        opacity .16s ease;
      will-change: transform, opacity;
    }

    .card:hover {
      box-shadow: 0 8px 24px rgba(0,0,0,.18);
    }

    .card-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      padding: 12px 14px;
      border-bottom: 1px solid var(--border);
      background: rgba(255,255,255,0.02);
      border-radius: 12px 12px 0 0;
      position: relative;
      z-index: 2;
    }

    .card-header h2 {
      margin: 0;
      font-size: 14px;
      overflow-wrap: anywhere;
    }

    .card-actions {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      flex: 0 0 auto;
      align-items: center;
      justify-content: flex-end;
      max-width: 100%;
    }

    .btn-mini {
      padding: 6px 8px;
      font-size: 11px;
      line-height: 1;
      white-space: nowrap;
    }

    .btn-window {
      width: 28px;
      height: 28px;
      padding: 0;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: 14px;
      font-weight: 700;
      flex: 0 0 auto;
    }

    .body {
      padding: 12px 14px;
      overflow: visible;
      border-radius: 0 0 12px 12px;
    }

    .grid-2 {
      display: grid;
      gap: 10px;
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .stat {
      background: var(--panel2);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 10px;
    }

    .stat .k {
      color: var(--muted);
      font-size: 11px;
      margin-bottom: 6px;
      text-transform: uppercase;
      letter-spacing: .04em;
      overflow-wrap: anywhere;
    }

    .stat .v {
      font-weight: 700;
      font-size: 14px;
      word-break: break-word;
      overflow-wrap: anywhere;
    }

    .mono {
      font-family: var(--mono);
      font-size: 12px;
      white-space: pre-wrap;
      word-break: break-word;
      overflow-wrap: anywhere;
    }

    .row {
      display: flex;
      gap: 8px;
      align-items: flex-start;
      flex-wrap: wrap;
      max-width: 100%;
      overflow-wrap: anywhere;
    }

    .pill {
      display: inline-flex;
      align-items: flex-start;
      max-width: 100%;
      padding: 3px 8px;
      border-radius: 10px;
      font-size: 11px;
      border: 1px solid var(--border);
      background: var(--panel2);
      white-space: normal;
      word-break: break-word;
      overflow-wrap: anywhere;
      line-break: anywhere;
    }

    .ok { color: var(--ok); border-color: rgba(62,207,142,.35); }
    .warn { color: var(--warn); border-color: rgba(245,185,66,.35); }
    .err { color: var(--err); border-color: rgba(255,107,107,.35); }

    .list {
      display: grid;
      gap: 8px;
      max-width: 100%;
    }

    .item {
      padding: 10px;
      border: 1px solid var(--border);
      border-radius: 10px;
      background: var(--panel2);
      max-width: 100%;
      overflow: hidden;
    }

    .item .meta {
      color: var(--muted);
      font-size: 11px;
      margin-bottom: 6px;
      overflow-wrap: anywhere;
      word-break: break-word;
    }

    .item .title {
      font-weight: 700;
      margin-bottom: 6px;
      word-break: break-word;
      overflow-wrap: anywhere;
    }

    details {
      max-width: 100%;
    }

    details summary {
      cursor: pointer;
      color: var(--blue);
      margin-top: 6px;
      user-select: none;
      overflow-wrap: anywhere;
    }

    .full {
      grid-column: 1 / -1;
    }

    .selector-form {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto auto;
      gap: 8px;
      max-width: 100%;
    }

    .selector-form input {
      width: 100%;
      background: #0d1117;
      color: var(--text);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 8px 10px;
      min-width: 0;
    }

    #selector-result {
      margin-top: 12px;
      max-width: 100%;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 12px;
      table-layout: fixed;
    }

    th, td {
      padding: 8px 6px;
      border-bottom: 1px solid var(--border);
      vertical-align: top;
      text-align: left;
      word-break: break-word;
      overflow-wrap: anywhere;
    }

    th {
      color: var(--muted);
      font-weight: 600;
      background: rgba(255,255,255,0.02);
    }

    .small {
      font-size: 11px;
      color: var(--muted);
      overflow-wrap: anywhere;
    }

    .is-expanded {
      grid-column: 1 / -1 !important;
      transform: none;
      box-shadow: 0 14px 40px rgba(0,0,0,.28);
      z-index: 20;
    }

    .card.is-expanded .card-header {
      position: sticky;
      z-index: 90;
      background: #151922;
      box-shadow: 0 4px 16px rgba(0,0,0,.22);
    }

    .container.has-expanded .card:not(.is-expanded) {
      display: none !important;
    }

    .container.has-expanded .card.is-expanded .body {
      animation: bodyFadeIn .18s ease;
    }

    @keyframes bodyFadeIn {
      from {
        opacity: .72;
        transform: translateY(3px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    @media (max-width: 1200px) {
      .container {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
      .full,
      .is-expanded {
        grid-column: 1 / -1 !important;
      }
    }

    @media (max-width: 800px) {
      .container {
        grid-template-columns: 1fr;
      }

      .grid-2 {
        grid-template-columns: 1fr;
      }

      .selector-form {
        grid-template-columns: 1fr;
      }

      .card-header {
        align-items: flex-start;
        flex-direction: column;
      }

      .card-actions {
        width: 100%;
        justify-content: flex-start;
      }
    }
  </style>
</head>
<body>
  <div class="topbar">
    <h1>PJe TJCE • Painel de Diagnóstico</h1>
    <div class="sub">Atalho: Alt+0 • foco em erros, DOM, seletor e storage</div>
    <div class="toolbar">
      <button id="btn-refresh">Atualizar agora</button>
      <button id="btn-refresh-storage">Testar storage</button>
      <button id="btn-clear-logs">Limpar logs/eventos</button>
      <button id="btn-clear-errors">Limpar erros/testes</button>
    </div>
  </div>

  <div class="container" id="dashboard-container">
    <div class="card" data-card-id="summary">
      <div class="card-header">
        <h2>Resumo runtime</h2>
        <div class="card-actions">
          <button class="btn-mini" id="btn-copy-summary">Copiar</button>
          <button class="btn-window" data-toggle-card="summary" title="Maximizar/restaurar">□</button>
        </div>
      </div>
      <div class="body" id="summary"></div>
    </div>

    <div class="card" data-card-id="health">
      <div class="card-header">
        <h2>Saúde / sinais</h2>
        <div class="card-actions">
          <button class="btn-window" data-toggle-card="health" title="Maximizar/restaurar">□</button>
        </div>
      </div>
      <div class="body" id="health"></div>
    </div>

    <div class="card" data-card-id="globals">
      <div class="card-header">
        <h2>Integração com runtime principal</h2>
        <div class="card-actions">
          <button class="btn-window" data-toggle-card="globals" title="Maximizar/restaurar">□</button>
        </div>
      </div>
      <div class="body" id="globals"></div>
    </div>

    <div class="card full" data-card-id="storage">
      <div class="card-header">
        <h2>Diagnóstico de storage</h2>
        <div class="card-actions">
          <button class="btn-mini" id="btn-copy-storage">Copiar</button>
          <button class="btn-window" data-toggle-card="storage" title="Maximizar/restaurar">□</button>
        </div>
      </div>
      <div class="body" id="storage"></div>
    </div>

    <div class="card full" data-card-id="selector">
      <div class="card-header">
        <h2>Teste manual de seletor</h2>
        <div class="card-actions">
          <button class="btn-mini" id="btn-copy-selector-tests">Copiar testes</button>
          <button class="btn-window" data-toggle-card="selector" title="Maximizar/restaurar">□</button>
        </div>
      </div>
      <div class="body">
        <div class="selector-form">
          <input id="selector-input" type="text" placeholder="Ex.: div[id$=':infoPPE'] ou caminho do catálogo">
          <button id="btn-test-css">Testar CSS</button>
          <button id="btn-test-catalog">Testar catálogo</button>
        </div>
        <div class="small" style="margin-top:8px;">
          O botão "Testar catálogo" usa <span class="mono">debugSelectorResolution(path)</span> se existir no runtime.
        </div>
        <div id="selector-result"></div>
      </div>
    </div>

    <div class="card" data-card-id="errors">
      <div class="card-header">
        <h2>Erros capturados</h2>
        <div class="card-actions">
          <button class="btn-mini" id="btn-copy-errors">Copiar</button>
          <button class="btn-window" data-toggle-card="errors" title="Maximizar/restaurar">□</button>
        </div>
      </div>
      <div class="body" id="errors"></div>
    </div>

    <div class="card" data-card-id="events">
      <div class="card-header">
        <h2>Eventos recentes</h2>
        <div class="card-actions">
          <button class="btn-mini" id="btn-copy-events">Copiar</button>
          <button class="btn-window" data-toggle-card="events" title="Maximizar/restaurar">□</button>
        </div>
      </div>
      <div class="body" id="events"></div>
    </div>

    <div class="card" data-card-id="logs">
      <div class="card-header">
        <h2>Console e logs</h2>
        <div class="card-actions">
          <button class="btn-mini" id="btn-copy-logs">Copiar</button>
          <button class="btn-window" data-toggle-card="logs" title="Maximizar/restaurar">□</button>
        </div>
      </div>
      <div class="body" id="logs"></div>
    </div>

    <div class="card full" data-card-id="network">
      <div class="card-header">
        <h2>Rede recente</h2>
        <div class="card-actions">
          <button class="btn-mini" id="btn-copy-network">Copiar</button>
          <button class="btn-window" data-toggle-card="network" title="Maximizar/restaurar">□</button>
        </div>
      </div>
      <div class="body" id="network"></div>
    </div>
  </div>
</body>
</html>
    `.trim();

    win.document.open();
    win.document.write(html);
    win.document.close();

    wireDashboardEvents(win);
  }

  function wireDashboardEvents(win) {
    const doc = win.document;

    doc.getElementById("btn-refresh")?.addEventListener("click", () => renderDashboard(true));

    doc.getElementById("btn-refresh-storage")?.addEventListener("click", () => {
      refreshStorageDiagnostics();
      renderDashboard(true);
    });

    doc.getElementById("btn-copy-summary")?.addEventListener("click", () => {
      U.copyText(buildSummaryText());
    });

    doc.getElementById("btn-copy-storage")?.addEventListener("click", () => {
      U.copyText(buildStorageText());
    });

    doc.getElementById("btn-copy-errors")?.addEventListener("click", () => {
      U.copyText(buildErrorsText());
    });

    doc.getElementById("btn-copy-events")?.addEventListener("click", () => {
      U.copyText(buildEventsText());
    });

    doc.getElementById("btn-copy-logs")?.addEventListener("click", () => {
      U.copyText(buildLogsText());
    });

    doc.getElementById("btn-copy-network")?.addEventListener("click", () => {
      U.copyText(buildNetworkText());
    });

    doc.getElementById("btn-copy-selector-tests")?.addEventListener("click", () => {
      U.copyText(buildSelectorRunsText());
    });

    doc.getElementById("btn-clear-logs")?.addEventListener("click", () => {
      State.logs = [];
      State.events = [];
      renderDashboard(true);
    });

    doc.getElementById("btn-clear-errors")?.addEventListener("click", () => {
      State.errors = [];
      State.selectorRuns = [];
      State.expandedErrors = new Set();
      renderDashboard(true);
    });

    doc.getElementById("btn-test-css")?.addEventListener("click", () => {
      const value = doc.getElementById("selector-input")?.value?.trim();
      if (!value) return;
      const result = runCssSelectorTest(value);
      showSelectorResult(result);
      renderDashboard(true);
    });

    doc.getElementById("btn-test-catalog")?.addEventListener("click", () => {
      const value = doc.getElementById("selector-input")?.value?.trim();
      if (!value) return;
      const result = runCatalogSelectorTest(value);
      showSelectorResult(result);
      renderDashboard(true);
    });

    doc.querySelectorAll("[data-toggle-card]").forEach((btn) => {
      btn.addEventListener("click", () => {
        toggleCardExpand(btn.getAttribute("data-toggle-card"));
      });
    });
  }

  function wireDynamicSectionEvents(win) {
    const doc = win.document;

    doc.querySelectorAll("details[data-error-id]").forEach((detailsEl) => {
      const id = detailsEl.getAttribute("data-error-id");
      if (!id || detailsEl.dataset.wired === "1") return;

      detailsEl.dataset.wired = "1";

      detailsEl.addEventListener("toggle", () => {
        if (detailsEl.open) {
          State.expandedErrors.add(id);
        } else {
          State.expandedErrors.delete(id);
        }
      });
    });
  }

  function renderDashboard(force = false) {
    const win = State.dashboardWindow;
    if (!win || win.closed) return;

    const now = Date.now();
    if (!force && now - State.lastRenderAt < 150) return;
    State.lastRenderAt = now;

    const doc = win.document;
    setHTML(doc.getElementById("summary"), renderSummaryHTML());
    setHTML(doc.getElementById("health"), renderHealthHTML());
    setHTML(doc.getElementById("globals"), renderGlobalsHTML());
    setHTML(doc.getElementById("storage"), renderStorageHTML());
    setHTML(doc.getElementById("errors"), renderErrorsHTML());
    setHTML(doc.getElementById("events"), renderEventsHTML());
    setHTML(doc.getElementById("logs"), renderLogsHTML());
    setHTML(doc.getElementById("network"), renderNetworkHTML());

    wireDynamicSectionEvents(win);
    applyExpandedCardState(win);
  }

  function setHTML(el, html) {
    if (!el) return;
    el.innerHTML = html;
  }

  function renderSummaryHTML() {
    const uptime = Date.now() - State.startedAt;
    const lastMutation = State.lastMutationAt ? U.fmtMs(Date.now() - State.lastMutationAt) + " atrás" : "-";
    const lastInteraction = State.lastUserInteractionAt ? U.fmtMs(Date.now() - State.lastUserInteractionAt) + " atrás" : "-";

    return `
      <div class="grid-2">
        <div class="stat"><div class="k">URL</div><div class="v mono">${escapeHtml(location.href)}</div></div>
        <div class="stat"><div class="k">Título</div><div class="v">${escapeHtml(document.title || "-")}</div></div>
        <div class="stat"><div class="k">Hash</div><div class="v mono">${escapeHtml(location.hash || "-")}</div></div>
        <div class="stat"><div class="k">ReadyState</div><div class="v">${escapeHtml(document.readyState)}</div></div>
        <div class="stat"><div class="k">Uptime</div><div class="v">${escapeHtml(U.fmtMs(uptime))}</div></div>
        <div class="stat"><div class="k">Última interação</div><div class="v">${escapeHtml(lastInteraction)}</div></div>
        <div class="stat"><div class="k">Total de mutações</div><div class="v">${State.mutationCount}</div></div>
        <div class="stat"><div class="k">Última mutação</div><div class="v">${escapeHtml(lastMutation)}</div></div>
      </div>
    `;
  }

  function renderHealthHTML() {
    const errors = State.errors.length;
    const warnings = State.logs.filter((l) => l.level === "warn").length;
    const consoleErrors = State.logs.filter((l) => l.level === "error").length;
    const recentMps = State.mutationSeries.slice(-5).map((i) => i.value);
    const avg = recentMps.length ? (recentMps.reduce((a, b) => a + b, 0) / recentMps.length).toFixed(1) : "0.0";

    const mutationStatus = (() => {
      const last = recentMps[recentMps.length - 1] || 0;
      if (last >= 50) return `<span class="pill err">DOM muito agitado</span>`;
      if (last >= 10) return `<span class="pill warn">DOM moderado</span>`;
      return `<span class="pill ok">DOM estável</span>`;
    })();

    return `
      <div class="grid-2">
        <div class="stat"><div class="k">Erros capturados</div><div class="v">${errors}</div></div>
        <div class="stat"><div class="k">Console.warn</div><div class="v">${warnings}</div></div>
        <div class="stat"><div class="k">Console.error</div><div class="v">${consoleErrors}</div></div>
        <div class="stat"><div class="k">Mutações/s média (5s)</div><div class="v">${avg}</div></div>
      </div>
      <div style="margin-top:10px;" class="row">
        ${mutationStatus}
        <span class="pill">${document.hasFocus() ? "janela com foco" : "janela sem foco"}</span>
        <span class="pill">${navigator.onLine ? "online" : "offline"}</span>
      </div>
      <div style="margin-top:10px;" class="small">
        Série recente de mutações/s: ${escapeHtml(recentMps.join(", ") || "-")}
      </div>
    `;
  }

  function renderGlobalsHTML() {
    const globals = U.runtimeGlobals();
    const items = Object.entries(globals)
      .map(([k, v]) => {
        const cls = v ? "ok" : "warn";
        const txt = v ? "sim" : "não";
        return `<div class="stat"><div class="k">${escapeHtml(k)}</div><div class="v"><span class="pill ${cls}">${txt}</span></div></div>`;
      })
      .join("");

    let catalogInfo = "";
    try {
      if (typeof window.getActiveCatalog === "function") {
        const cat = window.getActiveCatalog();
        catalogInfo = `
          <div style="margin-top:10px;" class="mono">
source: ${escapeHtml(cat?.source || "-")}
version: ${escapeHtml(cat?.meta?.version || "-")}
hash: ${escapeHtml(cat?.meta?.hash || "-")}
updatedAt: ${escapeHtml(cat?.meta?.updatedAt || "-")}
          </div>
        `;
      }
    } catch (error) {
      catalogInfo = `<div class="mono err">Erro lendo catálogo: ${escapeHtml(error?.message || String(error))}</div>`;
    }

    return `<div class="grid-2">${items}</div>${catalogInfo}`;
  }

  function renderStorageBlock(title, result) {
    if (!result) {
      return `<div class="item"><div class="title">${escapeHtml(title)}</div><div class="small">Sem teste executado.</div></div>`;
    }

    const statusClass = result.ok ? "ok" : "err";
    const statusText = result.ok ? "funcionando" : "falhou";

    return `
      <div class="item">
        <div class="meta">${escapeHtml(title)} • duração: ${escapeHtml(U.fmtMs(result.durationMs || 0))}</div>
        <div class="title">
          <span class="pill ${statusClass}">${escapeHtml(statusText)}</span>
          <span class="pill">${escapeHtml(location.origin)}</span>
        </div>
        <div class="mono">${escapeHtml(JSON.stringify(result, null, 2))}</div>
      </div>
    `;
  }

  function renderStorageHTML() {
    const diag = State.storageDiagnostics;
    const when = diag.lastRunAt ? U.iso(diag.lastRunAt) : "-";

    return `
      <div class="small" style="margin-bottom:10px;">
        Último teste: ${escapeHtml(when)}
      </div>
      <div class="list">
        ${renderStorageBlock("localStorage", diag.localStorage)}
        ${renderStorageBlock("sessionStorage", diag.sessionStorage)}
      </div>
    `;
  }

  function renderErrorsHTML() {
    if (!State.errors.length) {
      return `<div class="small">Nenhum erro capturado até agora.</div>`;
    }

    return `<div class="list">${State.errors.slice().reverse().slice(0, 25).map(renderErrorItem).join("")}</div>`;
  }

  function renderErrorItem(err) {
    const when = U.iso(err.ts);
    const title = err.message || err.name || err.kind;
    const ctx = {
      kind: err.kind,
      name: err.name,
      message: err.message,
      file: err.file,
      line: err.line,
      column: err.column,
      module: err.module,
      phase: err.phase,
      selectorPath: err.selectorPath,
      selector: err.selector,
      url: err.url,
      hash: err.hash,
      readyState: err.readyState,
      activeElement: err.activeElement,
      activeElementHtml: err.activeElementHtml,
      context: err.context,
      stack: err.stack,
    };

    const isOpen = State.expandedErrors.has(err.id);

    return `
      <div class="item">
        <div class="meta">${escapeHtml(when)} • ${escapeHtml(err.kind || "error")}</div>
        <div class="title">${escapeHtml(title)}</div>
        <div class="row">
          ${err.module ? `<span class="pill warn">módulo: ${escapeHtml(err.module)}</span>` : ""}
          ${err.phase ? `<span class="pill">fase: ${escapeHtml(err.phase)}</span>` : ""}
          ${err.selectorPath ? `<span class="pill err">path: ${escapeHtml(err.selectorPath)}</span>` : ""}
          ${err.file ? `<span class="pill">arquivo: ${escapeHtml(err.file)}</span>` : ""}
          ${Number.isFinite(err.line) ? `<span class="pill">linha: ${err.line}</span>` : ""}
        </div>
        <details data-error-id="${escapeHtml(err.id)}" ${isOpen ? "open" : ""}>
          <summary>Ver contexto completo</summary>
          <div class="mono">${escapeHtml(JSON.stringify(ctx, null, 2))}</div>
        </details>
      </div>
    `;
  }

  function renderEventsHTML() {
    if (!State.events.length) {
      return `<div class="small">Sem eventos recentes.</div>`;
    }

    return `<div class="list">${
      State.events
        .slice()
        .reverse()
        .slice(0, CONFIG.RECENT_EVENT_LIMIT)
        .map(
          (ev) => `
        <div class="item">
          <div class="meta">${escapeHtml(U.iso(ev.ts))} • ${escapeHtml(ev.level)}</div>
          <div class="title">${escapeHtml(ev.type)}</div>
          <div class="mono">${escapeHtml(JSON.stringify(ev.detail, null, 2))}</div>
        </div>
      `
        )
        .join("")
    }</div>`;
  }

  function renderLogsHTML() {
    if (!State.logs.length) {
      return `<div class="small">Sem logs registrados.</div>`;
    }

    return `<div class="list">${
      State.logs
        .slice()
        .reverse()
        .slice(0, 80)
        .map(
          (log) => `
        <div class="item">
          <div class="meta">${escapeHtml(U.iso(log.ts))} • ${escapeHtml(log.level)} • ${escapeHtml(log.source)}</div>
          <div class="mono">${escapeHtml(log.message)}</div>
        </div>
      `
        )
        .join("")
    }</div>`;
  }

  function renderNetworkHTML() {
    if (!State.network.length) {
      return `<div class="small">Sem requisições capturadas ainda.</div>`;
    }

    const rows = State.network
      .slice()
      .reverse()
      .slice(0, 50)
      .map(
        (n) => `
      <tr>
        <td>${escapeHtml(U.iso(n.ts))}</td>
        <td>${escapeHtml(n.type)}</td>
        <td>${escapeHtml(n.method || "-")}</td>
        <td>${escapeHtml(String(n.status ?? "-"))}</td>
        <td>${escapeHtml(U.fmtMs(n.durationMs || 0))}</td>
        <td class="mono">${escapeHtml(n.url || "-")}</td>
      </tr>
    `
      )
      .join("");

    return `
      <table>
        <thead>
          <tr>
            <th>Quando</th>
            <th>Tipo</th>
            <th>Método</th>
            <th>Status</th>
            <th>Duração</th>
            <th>URL</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    `;
  }

  function runCssSelectorTest(selector) {
    const startedAt = Date.now();
    const out = {
      id: `sel-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      ts: Date.now(),
      mode: "css",
      selector,
      ok: false,
      count: 0,
      durationMs: 0,
      sample: [],
      error: null,
    };

    try {
      const nodes = Array.from(document.querySelectorAll(selector)).slice(0, CONFIG.TEST_SELECTOR_LIMIT);
      out.ok = true;
      out.count = nodes.length;
      out.sample = nodes.slice(0, 8).map((node) => ({
        node: U.describeNode(node),
        html: U.safeOuterHTML(node, 1000),
        ancestors: U.collectAncestors(node, 3),
      }));
    } catch (error) {
      out.error = {
        name: error?.name || "SelectorError",
        message: error?.message || String(error),
        stack: error?.stack || null,
      };

      addError("selector-css-error", {
        name: error?.name || "SelectorError",
        message: error?.message || `Erro no seletor CSS: ${selector}`,
        stack: error?.stack || null,
        selector,
        phase: "manual-css-test",
      });
    }

    out.durationMs = Date.now() - startedAt;
    U.pushLimited(State.selectorRuns, out, 120);
    addEvent("selector-css-test", { selector, ok: out.ok, count: out.count, durationMs: out.durationMs });
    return out;
  }

  function runCatalogSelectorTest(path) {
    const startedAt = Date.now();
    const out = {
      id: `sel-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      ts: Date.now(),
      mode: "catalog",
      path,
      ok: false,
      durationMs: 0,
      result: null,
      error: null,
    };

    try {
      if (typeof window.debugSelectorResolution !== "function") {
        throw new Error("debugSelectorResolution(path) não está exposto no runtime principal.");
      }

      const result = window.debugSelectorResolution(path);
      out.ok = true;
      out.result = sanitizeCatalogDebugResult(result);

      if (!result?.found) {
        addError("selector-catalog-not-found", {
          name: "SelectorNotFound",
          message: `Nenhum nó encontrado para path: ${path}`,
          selectorPath: path,
          phase: "manual-catalog-test",
          context: out.result,
        });
      }
    } catch (error) {
      out.error = {
        name: error?.name || "CatalogDebugError",
        message: error?.message || String(error),
        stack: error?.stack || null,
      };

      addError("selector-catalog-error", {
        name: error?.name || "CatalogDebugError",
        message: error?.message || `Falha no debug do catálogo: ${path}`,
        stack: error?.stack || null,
        selectorPath: path,
        phase: "manual-catalog-test",
      });
    }

    out.durationMs = Date.now() - startedAt;
    U.pushLimited(State.selectorRuns, out, 120);
    addEvent("selector-catalog-test", { path, ok: out.ok, durationMs: out.durationMs });
    return out;
  }

  function sanitizeCatalogDebugResult(result) {
    if (!result) return null;

    return {
      path: result.path,
      validation: result.validation,
      entry: result.entry,
      found: result.found,
      attempts: Array.isArray(result.attempts) ? result.attempts : [],
      scope: {
        node: U.describeNode(result.scope),
        html: U.safeOuterHTML(result.scope instanceof Element ? result.scope : null, 1500),
      },
    };
  }

  function showSelectorResult(result) {
    const win = State.dashboardWindow;
    if (!win || win.closed) return;
    const el = win.document.getElementById("selector-result");
    if (!el) return;

    el.innerHTML = `
      <div class="item">
        <div class="meta">${escapeHtml(U.iso(result.ts))} • modo: ${escapeHtml(result.mode)} • duração: ${escapeHtml(U.fmtMs(result.durationMs || 0))}</div>
        <div class="title">${escapeHtml(result.selector || result.path || "-")}</div>
        <div class="mono">${escapeHtml(JSON.stringify(result, null, 2))}</div>
      </div>
    `;
  }

  function buildSummaryText() {
    return [
      "=== PJe TJCE - Painel de Diagnóstico ===",
      `URL: ${location.href}`,
      `Título: ${document.title}`,
      `Hash: ${location.hash}`,
      `ReadyState: ${document.readyState}`,
      `Uptime: ${U.fmtMs(Date.now() - State.startedAt)}`,
      `Total de mutações: ${State.mutationCount}`,
      `Última mutação: ${State.lastMutationAt ? U.iso(State.lastMutationAt) : "-"}`,
      `Erros: ${State.errors.length}`,
      `Eventos: ${State.events.length}`,
      `Logs: ${State.logs.length}`,
      "",
      "=== Storage ===",
      JSON.stringify(State.storageDiagnostics, null, 2),
      "",
      "=== Globals ===",
      JSON.stringify(U.runtimeGlobals(), null, 2),
    ].join("\n");
  }

  function buildStorageText() {
    return ["=== STORAGE DIAGNOSTICS ===", JSON.stringify(State.storageDiagnostics, null, 2)].join("\n\n");
  }

  function buildErrorsText() {
    return ["=== ERROS CAPTURADOS ===", ...State.errors.map((e) => JSON.stringify(e, null, 2))].join("\n\n");
  }

  function buildEventsText() {
    return ["=== EVENTOS RECENTES ===", ...State.events.map((e) => JSON.stringify(e, null, 2))].join("\n\n");
  }

  function buildLogsText() {
    return ["=== LOGS ===", ...State.logs.map((e) => JSON.stringify(e, null, 2))].join("\n\n");
  }

  function buildNetworkText() {
    return ["=== REDE ===", ...State.network.map((e) => JSON.stringify(e, null, 2))].join("\n\n");
  }

  function buildSelectorRunsText() {
    return ["=== TESTES DE SELETOR ===", ...State.selectorRuns.map((e) => JSON.stringify(e, null, 2))].join("\n\n");
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function registerKeyboardShortcut() {
    window.addEventListener(
      "keydown",
      (event) => {
        if (!event.altKey) return;
        if (event.key !== "0") return;
        event.preventDefault();
        event.stopPropagation();
        addEvent("shortcut-open-dashboard", { key: "Alt+0" });
        openDashboard();
      },
      true
    );
  }

  function bootstrap() {
    patchGlobalErrors();
    patchConsole();
    patchFetch();
    patchXHR();
    installMutationObserver();
    registerKeyboardShortcut();
    refreshStorageDiagnostics();

    addEvent("diagnostic-bootstrap", {
      url: location.href,
      title: document.title,
      readyState: document.readyState,
    });

    addLog("info", ["Painel de diagnóstico carregado. Atalho: Alt+0"], "diagnostic");
  }

  bootstrap();

  window.PJeDiag = {
    state: State,
    openDashboard,
    addError,
    addEvent,
    runCssSelectorTest,
    runCatalogSelectorTest,
    refreshStorageDiagnostics,
    buildSummaryText,
    buildStorageText,
    buildErrorsText,
    buildEventsText,
    buildLogsText,
    buildNetworkText,
    buildSelectorRunsText,
  };
})();
