function bindRange(inputId, labelId, cssVar, { unit = "px", cssUnit = unit } = {}) {
  const input = document.getElementById(inputId);
  const label = document.getElementById(labelId);
  const apply = () => {
    document.documentElement.style.setProperty(cssVar, `${input.value}${cssUnit}`);
    label.textContent = `${input.value}${unit}`;
  };
  input.addEventListener("input", apply);
  apply();
}

function bindCount(inputId, labelId, selector) {
  const input = document.getElementById(inputId);
  const label = document.getElementById(labelId);
  const items = Array.from(document.querySelectorAll(selector));
  const apply = () => {
    const count = Number(input.value);
    items.forEach((el, i) => {
      el.style.display = i < count ? "" : "none";
    });
    label.textContent = count;
  };
  input.addEventListener("input", apply);
  apply();
}

function makeDraggable(panel, excludeSelector) {
  let drag = null;

  panel.addEventListener("pointerdown", (e) => {
    if (excludeSelector && e.target.closest(excludeSelector)) return;

    const rect = panel.getBoundingClientRect();
    if (panel.style.position !== "fixed") {
      panel.style.position = "fixed";
      panel.style.margin = "0";
      panel.style.top = `${rect.top}px`;
      panel.style.left = `${rect.left}px`;
    }

    drag = { offsetX: e.clientX - rect.left, offsetY: e.clientY - rect.top };
    panel.classList.add("dragging");
    panel.setPointerCapture(e.pointerId);
  });

  panel.addEventListener("pointermove", (e) => {
    if (!drag) return;
    panel.style.left = `${e.clientX - drag.offsetX}px`;
    panel.style.top = `${e.clientY - drag.offsetY}px`;
  });

  function endDrag(e) {
    if (!drag) return;
    drag = null;
    panel.classList.remove("dragging");
    panel.releasePointerCapture(e.pointerId);
  }

  panel.addEventListener("pointerup", endDrag);
  panel.addEventListener("pointercancel", endDrag);
}

// Fire loader controls
bindRange("blur-range", "blur-value", "--ball-blur");
bindRange("width-range", "width-value", "--fire-w");
bindRange("height-range", "height-value", "--fire-h");
bindRange("speed-range", "speed-value", "--speed", { unit: "x", cssUnit: "" });
bindCount("count-range", "count-value", ".fire .ball");

// Smoke controls
bindRange("smoke-blur-range", "smoke-blur-value", "--smoke-blur");
bindRange("smoke-width-range", "smoke-width-value", "--smoke-puff-w");
bindRange("smoke-height-range", "smoke-height-value", "--smoke-puff-h");
bindRange("smoke-speed-range", "smoke-speed-value", "--smoke-speed", { unit: "x", cssUnit: "" });
bindCount("smoke-count-range", "smoke-count-value", ".smoke-loader .smoke");

makeDraggable(document.querySelector(".panel-fire"), ".fire-controls");
makeDraggable(document.querySelector(".panel-smoke"), ".smoke-controls");
