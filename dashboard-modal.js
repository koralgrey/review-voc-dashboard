(() => {
  "use strict";
  let overlay;

  function ensureModal() {
    if (overlay) return overlay;
    overlay = document.createElement("div");
    overlay.className = "dashboard-modal";
    overlay.hidden = true;
    overlay.innerHTML = `
      <section class="dashboard-modal-dialog" role="dialog" aria-modal="true" aria-labelledby="dashboardModalTitle">
        <header class="dashboard-modal-head">
          <div>
            <h2 id="dashboardModalTitle"></h2>
            <p id="dashboardModalSubtitle"></p>
          </div>
          <div class="dashboard-modal-actions">
            <button type="button" class="dashboard-modal-back">← 返回上一级</button>
            <button type="button" class="dashboard-modal-close" aria-label="关闭弹窗">×</button>
          </div>
        </header>
        <div id="dashboardModalBody" class="dashboard-modal-body"></div>
      </section>`;
    document.body.appendChild(overlay);
    overlay.addEventListener("click", event => {
      if (event.target === overlay || event.target.closest(".dashboard-modal-close, .dashboard-modal-back")) close();
    });
    document.addEventListener("keydown", event => {
      if (event.key === "Escape" && !overlay.hidden) close();
    });
    return overlay;
  }

  function open({title, subtitle = "", html = ""}) {
    const node = ensureModal();
    node.querySelector("#dashboardModalTitle").textContent = title;
    const subtitleNode = node.querySelector("#dashboardModalSubtitle");
    subtitleNode.textContent = subtitle;
    subtitleNode.hidden = !subtitle;
    node.querySelector("#dashboardModalBody").innerHTML = html;
    node.hidden = false;
    document.body.classList.add("modal-open");
    node.querySelector(".dashboard-modal-close").focus();
  }

  function close() {
    if (!overlay) return;
    overlay.hidden = true;
    document.body.classList.remove("modal-open");
  }

  window.DASHBOARD_MODAL = {open, close};
})();
