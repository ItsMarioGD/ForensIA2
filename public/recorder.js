// ForensIA2 · Video recorder overlay
// Adds a floating "Grabar MP4" button that captures the Three.js canvas via
// MediaRecorder and downloads the result. Non-invasive: it doesn't touch the
// React app tree at all, just finds the canvas element after the app mounts.

(function () {
  "use strict";

  function pickMime() {
    var candidates = [
      { mime: "video/mp4;codecs=avc1.42E01E,mp4a.40.2", ext: "mp4" },
      { mime: "video/mp4;codecs=avc1", ext: "mp4" },
      { mime: "video/mp4", ext: "mp4" },
      { mime: "video/webm;codecs=vp9,opus", ext: "webm" },
      { mime: "video/webm;codecs=vp8,opus", ext: "webm" },
      { mime: "video/webm", ext: "webm" }
    ];
    for (var i = 0; i < candidates.length; i++) {
      try {
        if (window.MediaRecorder && MediaRecorder.isTypeSupported(candidates[i].mime)) {
          return candidates[i];
        }
      } catch (_) {}
    }
    return { mime: "", ext: "webm" };
  }

  function getCanvas() {
    var root = document.getElementById("root");
    if (!root) return null;
    return root.querySelector("canvas");
  }

  function download(blob, name) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function ts() {
    return new Date().toISOString().replace(/[:.]/g, "-");
  }

  var state = {
    recorder: null,
    chunks: [],
    picked: null,
    startedAt: 0,
    timerId: 0
  };

  function fmtTime(ms) {
    var s = Math.floor(ms / 1000);
    var m = Math.floor(s / 60);
    return (m < 10 ? "0" : "") + m + ":" + (s % 60 < 10 ? "0" : "") + (s % 60);
  }

  function makeUI() {
    if (document.getElementById("forensia-recorder")) return;

    var css = document.createElement("style");
    css.textContent = "\
#forensia-recorder{position:fixed;bottom:20px;right:20px;z-index:99998;display:flex;gap:8px;align-items:center;padding:10px 12px;background:rgba(10,14,26,.92);backdrop-filter:blur(10px);border:1px solid rgba(255,255,255,.12);border-radius:14px;box-shadow:0 10px 30px rgba(0,0,0,.55);font-family:'Outfit',system-ui,sans-serif;color:#e6ecff}\
#forensia-recorder button{padding:8px 14px;font-size:13px;font-weight:600;color:#e6ecff;border:1px solid rgba(255,255,255,.15);background:linear-gradient(135deg,#4b7cff,#6b5bff);border-radius:9px;cursor:pointer;transition:filter .15s ease,transform .06s ease}\
#forensia-recorder button:hover{filter:brightness(1.1)}\
#forensia-recorder button:active{transform:translateY(1px)}\
#forensia-recorder button.recording{background:linear-gradient(135deg,#ff5b6b,#ff7a4b)}\
#forensia-recorder .dot{width:10px;height:10px;border-radius:50%;background:#ff5b6b;box-shadow:0 0 8px rgba(255,91,107,.8);animation:forensia-pulse 1s infinite;display:none}\
#forensia-recorder.recording .dot{display:inline-block}\
#forensia-recorder .time{font:12px/1 'JetBrains Mono',ui-monospace,Menlo,monospace;color:#b8c6ec;min-width:44px;display:none}\
#forensia-recorder.recording .time{display:inline-block}\
#forensia-recorder .hint{font-size:11px;color:#8ea0c8;margin-left:4px}\
@keyframes forensia-pulse{0%,100%{opacity:1}50%{opacity:.45}}\
#forensia-toast{position:fixed;bottom:80px;right:20px;z-index:99999;padding:10px 14px;background:rgba(10,14,26,.95);border:1px solid rgba(75,124,255,.5);border-radius:10px;color:#e6ecff;font:13px 'Outfit',system-ui,sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.5);pointer-events:none;opacity:0;transition:opacity .2s ease}\
#forensia-toast.show{opacity:1}\
";
    document.head.appendChild(css);

    var bar = document.createElement("div");
    bar.id = "forensia-recorder";
    bar.innerHTML =
      '<span class="dot"></span>' +
      '<span class="time">00:00</span>' +
      '<button id="forensia-rec-btn" type="button">● Grabar MP4</button>' +
      '<span class="hint" id="forensia-rec-hint">del choque en vivo</span>';
    document.body.appendChild(bar);

    var toast = document.createElement("div");
    toast.id = "forensia-toast";
    document.body.appendChild(toast);

    document.getElementById("forensia-rec-btn").addEventListener("click", toggle);
  }

  function showToast(msg, ms) {
    var el = document.getElementById("forensia-toast");
    if (!el) return;
    el.textContent = msg;
    el.classList.add("show");
    setTimeout(function () { el.classList.remove("show"); }, ms || 3200);
  }

  function updateTime() {
    var t = document.querySelector("#forensia-recorder .time");
    if (!t) return;
    t.textContent = fmtTime(Date.now() - state.startedAt);
  }

  function start() {
    var canvas = getCanvas();
    if (!canvas) {
      showToast("Genera una simulación primero (aún no hay lienzo 3D).", 3200);
      return false;
    }
    if (!window.MediaRecorder) {
      showToast("Tu navegador no soporta grabación de canvas.", 3200);
      return false;
    }
    var picked = pickMime();
    var stream;
    try {
      stream = canvas.captureStream(60);
    } catch (e) {
      showToast("Este navegador no permite captureStream sobre el canvas.", 3600);
      return false;
    }
    var opts = { videoBitsPerSecond: 10000000 };
    if (picked.mime) opts.mimeType = picked.mime;
    var rec;
    try {
      rec = new MediaRecorder(stream, opts);
    } catch (e) {
      showToast("MediaRecorder rechazó las opciones. Detalles: " + e.message, 3600);
      return false;
    }
    state.recorder = rec; state.chunks = []; state.picked = picked; state.startedAt = Date.now();
    rec.ondataavailable = function (e) { if (e.data && e.data.size > 0) state.chunks.push(e.data); };
    rec.onstop = function () {
      var blob = new Blob(state.chunks, { type: picked.mime || "video/webm" });
      var name = "forensia-choque-" + ts() + "." + picked.ext;
      download(blob, name);
      showToast("Video descargado: " + name, 4200);
    };
    rec.start(200);

    var btn = document.getElementById("forensia-rec-btn");
    var bar = document.getElementById("forensia-recorder");
    btn.textContent = "■ Detener y guardar";
    btn.classList.add("recording");
    bar.classList.add("recording");
    document.getElementById("forensia-rec-hint").textContent = "formato " + picked.ext.toUpperCase();
    state.timerId = setInterval(updateTime, 250);
    return true;
  }

  function stop() {
    if (!state.recorder) return;
    try { state.recorder.stop(); } catch (_) {}
    state.recorder = null;
    clearInterval(state.timerId); state.timerId = 0;
    var btn = document.getElementById("forensia-rec-btn");
    var bar = document.getElementById("forensia-recorder");
    if (btn) { btn.textContent = "● Grabar MP4"; btn.classList.remove("recording"); }
    if (bar) bar.classList.remove("recording");
    var hint = document.getElementById("forensia-rec-hint");
    if (hint) hint.textContent = "del choque en vivo";
  }

  function toggle() {
    if (state.recorder && state.recorder.state === "recording") stop();
    else start();
  }

  // Wait for the React app to render the canvas, then attach the UI.
  function waitForCanvas() {
    if (getCanvas()) { makeUI(); return; }
    var tries = 0;
    var iv = setInterval(function () {
      if (getCanvas() || tries++ > 120) { clearInterval(iv); makeUI(); }
    }, 500);
  }

  if (document.readyState === "complete" || document.readyState === "interactive") {
    setTimeout(waitForCanvas, 100);
  } else {
    document.addEventListener("DOMContentLoaded", function () { setTimeout(waitForCanvas, 100); });
  }
})();
