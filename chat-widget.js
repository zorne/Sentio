/**
 * Widget de chat "Léo" — Employés IA
 * ------------------------------------------------------------------
 * Ce script est chargé en <script defer> depuis la landing page et
 * doit être servi à l'URL déclarée par window.EMPLOYES_IA_API_BASE
 * (ex: https://api.employes-ia.com/chat-widget.js).
 *
 * CONTRAT AVEC LE BACKEND (route.ts) :
 *   POST {API_BASE}/api/chat
 *   body: { mode: "faq", messages: [{ role: "user"|"assistant", content: string }] }
 *   réponse 200: { reply: string }
 *   réponse erreur: { error: string }  (status 400/401/404/502)
 *
 * Ce widget n'utilise jamais mode:"configure" (réservé à une session
 * client authentifiée) — uniquement le mode "faq", public.
 *
 * Aucune clé API n'est présente dans ce fichier : le backend est seul
 * détenteur de la clé Gemini.
 * ------------------------------------------------------------------
 */
(function () {
  "use strict";

  var API_BASE = window.EMPLOYES_IA_API_BASE || "";
  var CHAT_ENDPOINT = API_BASE + "/api/chat";
  var HISTORY_LIMIT = 20; // sécurité miroir du backend
  var reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var history = []; // [{role:'user'|'assistant', content:string}]
  var isSending = false;
  var lastFocused = null;
  var panelOpen = false;

  // ---------------------------------------------------------------
  // STYLES — reprend les tokens visuels de la landing (couleurs,
  // typographies, rayons) via les variables CSS déjà définies sur :root.
  // ---------------------------------------------------------------
  var style = document.createElement("style");
  style.textContent = [
    ".eia-launcher{position:fixed;bottom:24px;right:24px;width:58px;height:58px;border-radius:50%;",
    "background:radial-gradient(circle at 30% 25%,#ffffff,#e4e8ec 55%,#b9c2cb 100%);border:none;cursor:pointer;",
    "box-shadow:0 0 0 1px rgba(255,255,255,0.15) inset,0 10px 30px rgba(0,0,0,0.45),0 0 40px rgba(255,255,255,0.12);",
    "z-index:900;display:flex;align-items:center;justify-content:center;transition:transform .25s cubic-bezier(.22,1,.36,1);}",

    ".eia-launcher:hover{transform:scale(1.06);}",
    ".eia-launcher:focus-visible{outline:2px solid #fff;outline-offset:3px;}",
    ".eia-launcher .eia-dot{position:absolute;top:2px;right:2px;width:12px;height:12px;border-radius:50%;",
    "background:#6ee7a8;box-shadow:0 0 8px rgba(110,231,168,.8);border:2px solid #050505;}",

    ".eia-panel{position:fixed;bottom:96px;right:24px;width:380px;max-width:calc(100vw - 32px);",
    "height:min(600px,calc(100vh - 140px));background:#0A0A0B;border:1px solid rgba(255,255,255,0.12);",
    "border-radius:20px;box-shadow:0 24px 80px rgba(0,0,0,0.6);z-index:901;display:flex;flex-direction:column;",
    "overflow:hidden;opacity:0;transform:translateY(16px) scale(0.98);pointer-events:none;",
    "transition:opacity .25s cubic-bezier(.22,1,.36,1),transform .25s cubic-bezier(.22,1,.36,1);",
    "font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;}",
    ".eia-panel.open{opacity:1;transform:translateY(0) scale(1);pointer-events:auto;}",

    "@media (max-width:640px){.eia-panel{right:12px;left:12px;bottom:88px;width:auto;",
    "height:min(72vh,600px);}}",

    ".eia-header{display:flex;align-items:center;gap:12px;padding:16px 16px;",
    "border-bottom:1px solid rgba(255,255,255,0.07);background:rgba(255,255,255,0.02);flex-shrink:0;}",
    ".eia-avatar{width:34px;height:34px;border-radius:50%;flex-shrink:0;",
    "background:radial-gradient(circle at 30% 25%,#ffffff,#e4e8ec 55%,#b9c2cb 100%);",
    "box-shadow:0 0 16px rgba(255,255,255,0.18);}",
    ".eia-header-text{flex:1;min-width:0;}",
    ".eia-header-text .name{font-size:14px;font-weight:600;color:#fff;letter-spacing:-0.01em;}",
    ".eia-header-text .status{display:flex;align-items:center;gap:6px;font-size:11.5px;color:rgba(255,255,255,0.46);margin-top:1px;}",
    ".eia-header-text .status .pulse{width:6px;height:6px;border-radius:50%;background:#6ee7a8;",
    "box-shadow:0 0 6px rgba(110,231,168,.7);flex-shrink:0;}",
    ".eia-close{width:30px;height:30px;border-radius:50%;border:1px solid rgba(255,255,255,0.07);",
    "background:rgba(255,255,255,0.03);color:rgba(255,255,255,0.56);cursor:pointer;flex-shrink:0;",
    "display:flex;align-items:center;justify-content:center;transition:all .2s ease;}",
    ".eia-close:hover{background:rgba(255,255,255,0.055);color:#fff;}",
    ".eia-close:focus-visible{outline:2px solid #fff;outline-offset:2px;}",

    ".eia-messages{flex:1;overflow-y:auto;padding:18px 16px;display:flex;flex-direction:column;gap:12px;",
    "scroll-behavior:smooth;}",
    ".eia-messages::-webkit-scrollbar{width:6px;}",
    ".eia-messages::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.12);border-radius:3px;}",

    ".eia-row{display:flex;}",
    ".eia-row.user{justify-content:flex-end;}",
    ".eia-row.assistant{justify-content:flex-start;}",
    ".eia-bubble{max-width:82%;padding:10px 13px;border-radius:14px;font-size:13.5px;line-height:1.55;",
    "white-space:pre-wrap;word-wrap:break-word;}",
    ".eia-row.user .eia-bubble{background:#fff;color:#0a0a0b;border-bottom-right-radius:4px;}",
    ".eia-row.assistant .eia-bubble{background:rgba(255,255,255,0.055);color:rgba(255,255,255,0.9);",
    "border:1px solid rgba(255,255,255,0.07);border-bottom-left-radius:4px;}",
    ".eia-row.error .eia-bubble{background:rgba(248,113,113,0.08);color:#fca5a5;border:1px solid rgba(248,113,113,0.25);}",

    ".eia-typing{display:flex;gap:4px;align-items:center;padding:4px 2px;}",
    ".eia-typing span{width:6px;height:6px;border-radius:50%;background:rgba(255,255,255,0.4);",
    "animation:eiaBounce 1.2s ease-in-out infinite;}",
    ".eia-typing span:nth-child(2){animation-delay:.15s;}",
    ".eia-typing span:nth-child(3){animation-delay:.3s;}",
    "@keyframes eiaBounce{0%,60%,100%{transform:translateY(0);opacity:.5;}30%{transform:translateY(-4px);opacity:1;}}",

    ".eia-footer{border-top:1px solid rgba(255,255,255,0.07);padding:12px;display:flex;gap:8px;",
    "align-items:flex-end;flex-shrink:0;background:rgba(255,255,255,0.015);}",
    ".eia-input{flex:1;resize:none;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.1);",
    "border-radius:12px;color:#fff;font-size:13.5px;font-family:inherit;padding:9px 12px;max-height:96px;",
    "line-height:1.4;outline:none;transition:border-color .2s ease;}",
    ".eia-input:focus{border-color:rgba(255,255,255,0.35);}",
    ".eia-input::placeholder{color:rgba(255,255,255,0.35);}",
    ".eia-send{width:36px;height:36px;border-radius:10px;border:none;background:#fff;color:#0a0a0b;",
    "cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;",
    "transition:transform .15s ease,opacity .15s ease;}",
    ".eia-send:hover:not(:disabled){transform:scale(1.05);}",
    ".eia-send:disabled{opacity:.35;cursor:default;}",
    ".eia-send:focus-visible{outline:2px solid #fff;outline-offset:2px;}",

    ".eia-empty{margin:auto;text-align:center;padding:0 12px;}",
    ".eia-empty p{font-size:12.5px;color:rgba(255,255,255,0.4);margin-top:6px;}"
  ].join("");
  document.head.appendChild(style);

  // ---------------------------------------------------------------
  // DOM
  // ---------------------------------------------------------------
  var launcher = document.createElement("button");
  launcher.type = "button";
  launcher.className = "eia-launcher";
  launcher.setAttribute("aria-label", "Ouvrir le chat avec Léo");
  launcher.innerHTML =
    '<svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M4 4h16v11a2 2 0 0 1-2 2H9l-5 4V4z" stroke="#0a0a0b" stroke-width="1.7" stroke-linejoin="round"/></svg>' +
    '<span class="eia-dot" aria-hidden="true"></span>';

  var panel = document.createElement("div");
  panel.className = "eia-panel";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", "Chat avec Léo, assistant Employés IA");
  panel.setAttribute("aria-modal", "false");
  panel.innerHTML =
    '<div class="eia-header">' +
      '<div class="eia-avatar"></div>' +
      '<div class="eia-header-text">' +
        '<div class="name">Léo</div>' +
        '<div class="status"><span class="pulse"></span>Assistant Employés IA</div>' +
      "</div>" +
      '<button type="button" class="eia-close" aria-label="Fermer le chat">' +
        '<svg width="13" height="13" viewBox="0 0 14 14"><path d="M2 2L12 12M12 2L2 12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>' +
      "</button>" +
    "</div>" +
    '<div class="eia-messages" id="eiaMessages"></div>' +
    '<form class="eia-footer" id="eiaForm">' +
      '<textarea class="eia-input" id="eiaInput" rows="1" placeholder="Écrivez à Léo…" aria-label="Votre message"></textarea>' +
      '<button type="submit" class="eia-send" id="eiaSend" aria-label="Envoyer">' +
        '<svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" stroke="#0a0a0b" stroke-width="1.7" stroke-linejoin="round" stroke-linecap="round"/></svg>' +
      "</button>" +
    "</form>";

  document.body.appendChild(launcher);
  document.body.appendChild(panel);

  var messagesEl = panel.querySelector("#eiaMessages");
  var formEl = panel.querySelector("#eiaForm");
  var inputEl = panel.querySelector("#eiaInput");
  var sendBtn = panel.querySelector("#eiaSend");
  var closeBtn = panel.querySelector(".eia-close");

  // ---------------------------------------------------------------
  // Rendu des messages (échappement HTML pour éviter toute injection)
  // ---------------------------------------------------------------
  function escapeHtml(str) {
    var div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  function scrollToBottom() {
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function renderEmptyState() {
    var empty = document.createElement("div");
    empty.className = "eia-empty";
    empty.innerHTML =
      '<div class="eia-avatar" style="width:44px;height:44px;margin:0 auto;"></div>' +
      "<p>Bonjour 👋 Je suis Léo. Posez-moi une question sur nos<br>Employés IA, la tarification ou la sécurité.</p>";
    messagesEl.appendChild(empty);
  }

  function addBubble(role, content) {
    var row = document.createElement("div");
    row.className = "eia-row " + role;
    var bubble = document.createElement("div");
    bubble.className = "eia-bubble";
    bubble.innerHTML = escapeHtml(content).replace(/\n/g, "<br>");
    row.appendChild(bubble);
    var empty = messagesEl.querySelector(".eia-empty");
    if (empty) empty.remove();
    messagesEl.appendChild(row);
    scrollToBottom();
    return row;
  }

  function addTypingIndicator() {
    var row = document.createElement("div");
    row.className = "eia-row assistant";
    row.id = "eiaTyping";
    row.innerHTML =
      '<div class="eia-bubble eia-typing"><span></span><span></span><span></span></div>';
    messagesEl.appendChild(row);
    scrollToBottom();
  }

  function removeTypingIndicator() {
    var el = document.getElementById("eiaTyping");
    if (el) el.remove();
  }

  // ---------------------------------------------------------------
  // Envoi au backend
  // ---------------------------------------------------------------
  function sendMessage(text) {
    if (isSending || !text.trim()) return;
    isSending = true;
    sendBtn.disabled = true;

    history.push({ role: "user", content: text.trim() });
    addBubble("user", text.trim());
    addTypingIndicator();

    var payload = {
      mode: "faq",
      messages: history.slice(-HISTORY_LIMIT),
    };

    fetch(CHAT_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
      .then(function (res) {
        return res.json().then(function (data) {
          if (!res.ok) throw new Error(data && data.error ? data.error : "Erreur serveur");
          return data;
        });
      })
      .then(function (data) {
        removeTypingIndicator();
        var reply = data.reply || "Désolé, je n'ai pas de réponse à vous proposer pour le moment.";
        history.push({ role: "assistant", content: reply });
        addBubble("assistant", reply);
      })
      .catch(function (err) {
        console.error("Erreur widget Léo:", err);
        removeTypingIndicator();
        var row = addBubble(
          "assistant",
          "Désolé, une erreur est survenue. Réessayez dans un instant, ou écrivez-nous directement à contact@employes-ia.com."
        );
        row.classList.add("error");
      })
      .finally(function () {
        isSending = false;
        sendBtn.disabled = false;
      });
  }

  // ---------------------------------------------------------------
  // Ouverture / fermeture
  // ---------------------------------------------------------------
  function openPanel() {
    if (panelOpen) return;
    panelOpen = true;
    if (messagesEl.children.length === 0) renderEmptyState();
    lastFocused = document.activeElement;
    panel.classList.add("open");
    launcher.setAttribute("aria-expanded", "true");
    setTimeout(function () {
      inputEl.focus();
    }, reducedMotion ? 0 : 260);
    document.addEventListener("keydown", onKeydown);
  }

  function closePanel() {
    if (!panelOpen) return;
    panelOpen = false;
    panel.classList.remove("open");
    launcher.setAttribute("aria-expanded", "false");
    document.removeEventListener("keydown", onKeydown);
    if (lastFocused && typeof lastFocused.focus === "function") lastFocused.focus();
    else launcher.focus();
  }

  function togglePanel() {
    if (panelOpen) closePanel();
    else openPanel();
  }

  function onKeydown(e) {
    if (e.key === "Escape") closePanel();
  }

  launcher.addEventListener("click", togglePanel);
  closeBtn.addEventListener("click", closePanel);

  // Auto-resize du textarea
  inputEl.addEventListener("input", function () {
    inputEl.style.height = "auto";
    inputEl.style.height = Math.min(inputEl.scrollHeight, 96) + "px";
  });

  // Entrée = envoi, Maj+Entrée = saut de ligne
  inputEl.addEventListener("keydown", function (e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      formEl.requestSubmit ? formEl.requestSubmit() : formEl.dispatchEvent(new Event("submit", { cancelable: true }));
    }
  });

  formEl.addEventListener("submit", function (e) {
    e.preventDefault();
    var text = inputEl.value;
    inputEl.value = "";
    inputEl.style.height = "auto";
    sendMessage(text);
  });

  // ---------------------------------------------------------------
  // API publique + compatibilité avec les boutons déjà présents sur
  // la page (window.EmployesIAChat.open() / window.__eiaChatPending)
  // ---------------------------------------------------------------
  window.EmployesIAChat = {
    open: openPanel,
    close: closePanel,
    toggle: togglePanel,
  };

  if (window.__eiaChatPending) {
    window.__eiaChatPending = false;
    openPanel();
  }

  if (!API_BASE) {
    console.warn(
      "[Léo] window.EMPLOYES_IA_API_BASE n'est pas défini : les messages ne pourront pas être envoyés."
    );
  }
})();
