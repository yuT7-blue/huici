// ChatGPT detection adapted from FocusWhileAI's src/utils/siteDetect.ts (MIT).
(() => {
  const stopSelector = 'button[aria-label="Stop streaming"], button[data-testid="stop-button"]';
  const waitMs = 3000;
  let activeMessage;
  let startedAt;
  let dismissed = false;
  let prompt;

  function removePrompt() {
    prompt?.remove();
    prompt = undefined;
  }

  function update() {
    const busy = Boolean(document.querySelector(stopSelector));
    const messages = busy ? document.querySelectorAll('[data-message-author-role="user"]') : [];
    const message = messages[messages.length - 1];
    if (message !== activeMessage) {
      removePrompt();
      activeMessage = message;
      startedAt = Date.now();
      dismissed = false;
    }
    if (!message || dismissed) return;

    const replies = document.querySelectorAll('[data-message-author-role="assistant"]');
    const reply = replies[replies.length - 1];
    if (reply && (message.compareDocumentPosition(reply) & Node.DOCUMENT_POSITION_FOLLOWING) && reply.innerText.trim()) {
      removePrompt();
      dismissed = true;
      return;
    }
    if (prompt || Date.now() - startedAt < waitMs || !message.innerText.trim()) return;

    prompt = document.createElement("aside");
    prompt.className = "huici-wait-prompt";
    prompt.setAttribute("aria-label", "回此等待提示");
    const question = document.createElement("span");
    question.textContent = "等答案出来，你想先核对刚才提到的哪一点？";
    const close = document.createElement("button");
    close.type = "button";
    close.textContent = "安静等";
    close.onclick = () => { dismissed = true; removePrompt(); };
    prompt.append(question, close);
    message.after(prompt);
  }

  window.setInterval(update, 500);
})();
