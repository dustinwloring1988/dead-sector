(() => {
  "use strict";

  const OBSTACLE_COLORS = {
    rock: "#5a5a5a",
    crate: "#8B6914",
    fence: "#6b8e23",
    barrel: "#8B4513",
    toxicBarrel: "#2ecc71",
    caveWall: "#333333",
    door: "#e94560",
    golfDoor: "#9b59b6",
  };

  const ENTITY_COLORS = {
    buyStation: "#f39c12",
    ammoBox: "#3498db",
    golfHole: "#1abc9c",
    torch: "#f1c40f",
    caveLight: "#ecf0f1",
    bossLava: "#e74c3c",
  };

  const LAYERS = [
    { id: "grid", label: "Grid", defaultOn: true },
    { id: "areas", label: "Map Areas (Cave/Golf)", defaultOn: true },
    { id: "obstacles", label: "Obstacles", defaultOn: true },
    { id: "bossLava", label: "Boss Lava", defaultOn: true },
    { id: "buyStations", label: "Buy Stations", defaultOn: true },
    { id: "ammoBoxes", label: "Ammo Boxes", defaultOn: true },
    { id: "golfHoles", label: "Golf Holes", defaultOn: true },
    { id: "torches", label: "Torches", defaultOn: true },
    { id: "caveLights", label: "Cave Lights", defaultOn: true },
    { id: "specials", label: "Generator/Totem", defaultOn: true },
  ];

  let mapData = null;
  let layerVisibility = {};
  let camera = { x: 0, y: 0, zoom: 0.4 };
  let currentTool = "select";
  let selectedEntity = null;
  let isDragging = false;
  let dragStart = { x: 0, y: 0 };
  let dragEntityStart = null;
  let isPanning = false;
  let panStart = { x: 0, y: 0 };
  let panCameraStart = { x: 0, y: 0 };

  const canvas = document.getElementById("map-canvas");
  const ctx = canvas.getContext("2d");
  const container = document.getElementById("canvas-container");

  function initLayers() {
    const el = document.getElementById("layers");
    el.innerHTML = "";
    LAYERS.forEach((l) => {
      if (!(l.id in layerVisibility)) layerVisibility[l.id] = l.defaultOn;
      const label = document.createElement("label");
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = layerVisibility[l.id];
      cb.addEventListener("change", () => {
        layerVisibility[l.id] = cb.checked;
        render();
      });
      label.appendChild(cb);
      label.appendChild(document.createTextNode(" " + l.label));
      el.appendChild(label);
    });
  }

  function resizeCanvas() {
    canvas.width = container.clientWidth;
    canvas.height = container.clientHeight;
    render();
  }

  function worldToScreen(wx, wy) {
    return {
      x: (wx - camera.x) * camera.zoom + canvas.width / 2,
      y: (wy - camera.y) * camera.zoom + canvas.height / 2,
    };
  }

  function screenToWorld(sx, sy) {
    return {
      x: (sx - canvas.width / 2) / camera.zoom + camera.x,
      y: (sy - canvas.height / 2) / camera.zoom + camera.y,
    };
  }

  function drawGrid() {
    if (!mapData || !layerVisibility.grid) return;
    const step = 100;
    ctx.strokeStyle = "rgba(255,255,255,0.06)";
    ctx.lineWidth = 1;
    const tl = screenToWorld(0, 0);
    const br = screenToWorld(canvas.width, canvas.height);
    const startX = Math.floor(tl.x / step) * step;
    const startY = Math.floor(tl.y / step) * step;
    ctx.beginPath();
    for (let x = startX; x <= br.x; x += step) {
      const s = worldToScreen(x, 0);
      ctx.moveTo(s.x, 0);
      ctx.lineTo(s.x, canvas.height);
    }
    for (let y = startY; y <= br.y; y += step) {
      const s = worldToScreen(0, y);
      ctx.moveTo(0, s.y);
      ctx.lineTo(canvas.width, s.y);
    }
    ctx.stroke();
  }

  function drawMapBounds() {
    if (!mapData) return;
    const tl = worldToScreen(0, 0);
    const br = worldToScreen(mapData.width, mapData.height);
    ctx.strokeStyle = "#ffffff44";
    ctx.lineWidth = 2;
    ctx.strokeRect(tl.x, tl.y, br.x - tl.x, br.y - tl.y);
  }

  function drawRect(r, color, alpha = 0.35, label) {
    const s = worldToScreen(r.x, r.y);
    const sw = r.w * camera.zoom;
    const sh = r.h * camera.zoom;
    ctx.fillStyle = color;
    ctx.globalAlpha = alpha;
    ctx.fillRect(s.x, s.y, sw, sh);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.strokeRect(s.x, s.y, sw, sh);
    if (label && camera.zoom > 0.3) {
      ctx.fillStyle = "#fff";
      ctx.font = `${Math.max(10, 11 * camera.zoom)}px system-ui`;
      ctx.fillText(label, s.x + 3, s.y + 13 * camera.zoom);
    }
  }

  function drawPoint(p, color, radius = 5, label) {
    const s = worldToScreen(p.x, p.y);
    const r = Math.max(3, radius * camera.zoom);
    ctx.beginPath();
    ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 1;
    ctx.stroke();
    if (label && camera.zoom > 0.3) {
      ctx.fillStyle = "#fff";
      ctx.font = `${Math.max(9, 10 * camera.zoom)}px system-ui`;
      ctx.fillText(label, s.x + r + 3, s.y + 3);
    }
  }

  function drawSelection(entity) {
    if (!entity) return;
    if (entity._kind === "rect") {
      const s = worldToScreen(entity.x, entity.y);
      const sw = entity.w * camera.zoom;
      const sh = entity.h * camera.zoom;
      ctx.strokeStyle = "#00ffff";
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      ctx.strokeRect(s.x - 2, s.y - 2, sw + 4, sh + 4);
      ctx.setLineDash([]);
    } else if (entity._kind === "point") {
      const s = worldToScreen(entity.x, entity.y);
      ctx.beginPath();
      ctx.arc(s.x, s.y, 8 * camera.zoom, 0, Math.PI * 2);
      ctx.strokeStyle = "#00ffff";
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  function render() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!mapData) {
      ctx.fillStyle = "#667";
      ctx.font = "18px system-ui";
      ctx.textAlign = "center";
      ctx.fillText("Drop a .ts/.json map file here, or click Import Map", canvas.width / 2, canvas.height / 2);
      ctx.textAlign = "start";
      return;
    }

    drawGrid();
    drawMapBounds();

    if (layerVisibility.areas) {
      drawRect(mapData.cave.rect, "#2d1b4e", 0.25, "Cave");
      drawRect(mapData.golfRoom.rect, "#1b3a2d", 0.25, "Golf Room");
      drawRect(
        { x: mapData.cave.entry.x, y: mapData.cave.rect.y, w: mapData.cave.entry.w, h: mapData.cave.rect.h },
        "#e94560",
        0.3,
        "Cave Entry"
      );
      drawRect(
        { x: mapData.golfRoom.entry.x, y: mapData.golfRoom.rect.y, w: mapData.golfRoom.entry.w, h: mapData.golfRoom.rect.h },
        "#9b59b6",
        0.3,
        "Golf Entry"
      );
    }

    if (layerVisibility.obstacles) {
      mapData.obstacles.forEach((o) => {
        const color = OBSTACLE_COLORS[o.type] || "#888";
        drawRect(o, color, 0.5, o.type);
        if (selectedEntity === o) drawSelection(o);
      });
    }

    if (layerVisibility.bossLava) {
      mapData.bossLava.forEach((l) => {
        drawRect(l, ENTITY_COLORS.bossLava, 0.5, "Lava");
        if (selectedEntity === l) drawSelection(l);
      });
    }

    if (layerVisibility.buyStations) {
      mapData.buyStations.forEach((b) => {
        drawRect({ x: b.x, y: b.y, w: 80, h: 80 }, ENTITY_COLORS.buyStation, 0.6, b.weapon);
        if (selectedEntity === b) drawSelection({ ...b, _kind: "rect", w: 80, h: 80 });
      });
    }

    if (layerVisibility.ammoBoxes) {
      mapData.ammoBoxes.forEach((a) => {
        drawPoint(a, ENTITY_COLORS.ammoBox, 8, "Ammo");
        if (selectedEntity === a) drawSelection(a);
      });
    }

    if (layerVisibility.golfHoles) {
      mapData.golfHoles.forEach((g) => {
        drawPoint(g, ENTITY_COLORS.golfHole, 6, "Hole");
        if (selectedEntity === g) drawSelection(g);
      });
    }

    if (layerVisibility.torches) {
      mapData.torches.positions.forEach((t) => {
        drawPoint(t, ENTITY_COLORS.torch, 6, "Torch");
        ctx.beginPath();
        const ts = worldToScreen(t.x, t.y);
        ctx.arc(ts.x, ts.y, mapData.torches.lightRadius * camera.zoom, 0, Math.PI * 2);
        ctx.strokeStyle = "#f1c40f33";
        ctx.lineWidth = 1;
        ctx.stroke();
        if (selectedEntity === t) drawSelection(t);
      });
    }

    if (layerVisibility.caveLights) {
      mapData.caveLights.forEach((c) => {
        drawPoint(c, ENTITY_COLORS.caveLight, 5, "Light");
        if (selectedEntity === c) drawSelection(c);
      });
    }

    if (layerVisibility.specials) {
      drawPoint(mapData.cave.generatorPos, "#e74c3c", 10, "Generator");
      drawPoint(mapData.cave.totemPos, "#f39c12", 10, "Totem");
    }
  }

  function getAllClickableEntities() {
    if (!mapData) return [];
    const entities = [];
    mapData.obstacles.forEach((o) => {
      entities.push({ ...o, _kind: "rect", _collection: "obstacles" });
    });
    mapData.bossLava.forEach((l) => {
      entities.push({ ...l, _kind: "rect", _collection: "bossLava" });
    });
    mapData.buyStations.forEach((b) => {
      entities.push({ x: b.x, y: b.y, w: 80, h: 80, _kind: "rect", _collection: "buyStations", _ref: b });
    });
    mapData.ammoBoxes.forEach((a) => {
      entities.push({ ...a, _kind: "point", _collection: "ammoBoxes" });
    });
    mapData.golfHoles.forEach((g) => {
      entities.push({ ...g, _kind: "point", _collection: "golfHoles" });
    });
    mapData.torches.positions.forEach((t) => {
      entities.push({ ...t, _kind: "point", _collection: "torches" });
    });
    mapData.caveLights.forEach((c) => {
      entities.push({ ...c, _kind: "point", _collection: "caveLights" });
    });
    return entities;
  }

  function hitTest(wx, wy) {
    const entities = getAllClickableEntities();
    for (let i = entities.length - 1; i >= 0; i--) {
      const e = entities[i];
      if (e._kind === "rect") {
        if (wx >= e.x && wx <= e.x + e.w && wy >= e.y && wy <= e.y + e.h) return e;
      } else {
        const dx = wx - e.x;
        const dy = wy - e.y;
        if (Math.sqrt(dx * dx + dy * dy) < 15 / camera.zoom) return e;
      }
    }
    return null;
  }

  function findOriginal(entity) {
    if (!mapData || !entity) return null;
    const col = entity._collection;
    if (!col) return null;
    if (col === "torches") {
      return mapData.torches.positions.find((p) => p === entity);
    }
    if (col === "buyStations") {
      return entity._ref || mapData[col].find((b) => b.x === entity.x && b.y === entity.y);
    }
    return mapData[col].find((item) => item === entity || (item.x === entity.x && item.y === entity.y && item.w === entity.w && item.h === entity.h));
  }

  function showProperties(entity) {
    const panel = document.getElementById("properties-panel");
    if (!entity) {
      selectedEntity = null;
      panel.innerHTML = '<p class="hint">Select an element to edit its properties</p>';
      render();
      return;
    }
    selectedEntity = entity;
    let html = "";
    const col = entity._collection;

    if (col === "obstacles") {
      html += `<label>Type
        <select id="prop-type">${["rock","crate","fence","barrel","toxicBarrel","caveWall","door","golfDoor"].map((t) => `<option value="${t}"${t===entity.type?" selected":""}>${t}</option>`).join("")}</select></label>`;
      html += `<div class="row">
        <label>X <input type="number" id="prop-x" value="${entity.x}" /></label>
        <label>Y <input type="number" id="prop-y" value="${entity.y}" /></label></div>`;
      html += `<div class="row">
        <label>W <input type="number" id="prop-w" value="${entity.w}" /></label>
        <label>H <input type="number" id="prop-h" value="${entity.h}" /></label></div>`;
      html += `<label>HP <input type="number" id="prop-hp" value="${entity.hp || ""}" placeholder="none" /></label>`;
      html += `<button class="btn btn-danger" id="prop-delete">Delete</button>`;
    } else if (col === "bossLava") {
      html += `<div class="row">
        <label>X <input type="number" id="prop-x" value="${entity.x}" /></label>
        <label>Y <input type="number" id="prop-y" value="${entity.y}" /></label></div>`;
      html += `<div class="row">
        <label>W <input type="number" id="prop-w" value="${entity.w}" /></label>
        <label>H <input type="number" id="prop-h" value="${entity.h}" /></label></div>`;
      html += `<button class="btn btn-danger" id="prop-delete">Delete</button>`;
    } else if (col === "buyStations") {
      const ref = entity._ref || entity;
      html += `<label>Weapon <input type="text" id="prop-weapon" value="${ref.weapon}" /></label>`;
      html += `<div class="row">
        <label>X <input type="number" id="prop-x" value="${ref.x}" /></label>
        <label>Y <input type="number" id="prop-y" value="${ref.y}" /></label></div>`;
      html += `<button class="btn btn-danger" id="prop-delete">Delete</button>`;
    } else {
      html += `<div class="row">
        <label>X <input type="number" id="prop-x" value="${entity.x}" /></label>
        <label>Y <input type="number" id="prop-y" value="${entity.y}" /></label></div>`;
      html += `<button class="btn btn-danger" id="prop-delete">Delete</button>`;
    }

    panel.innerHTML = html;

    const commit = () => {
      const orig = findOriginal(entity);
      if (!orig) return;
      if (col === "obstacles") {
        orig.type = document.getElementById("prop-type").value;
        orig.x = +document.getElementById("prop-x").value;
        orig.y = +document.getElementById("prop-y").value;
        orig.w = +document.getElementById("prop-w").value;
        orig.h = +document.getElementById("prop-h").value;
        const hpVal = document.getElementById("prop-hp").value;
        if (hpVal) orig.hp = +hpVal; else delete orig.hp;
        Object.assign(entity, orig);
      } else if (col === "bossLava") {
        orig.x = +document.getElementById("prop-x").value;
        orig.y = +document.getElementById("prop-y").value;
        orig.w = +document.getElementById("prop-w").value;
        orig.h = +document.getElementById("prop-h").value;
        Object.assign(entity, orig);
      } else if (col === "buyStations") {
        orig.weapon = document.getElementById("prop-weapon").value;
        orig.x = +document.getElementById("prop-x").value;
        orig.y = +document.getElementById("prop-y").value;
      } else {
        orig.x = +document.getElementById("prop-x").value;
        orig.y = +document.getElementById("prop-y").value;
        Object.assign(entity, orig);
      }
      render();
    };

    panel.querySelectorAll("input, select").forEach((el) => {
      el.addEventListener("change", commit);
    });

    const delBtn = document.getElementById("prop-delete");
    if (delBtn) {
      delBtn.addEventListener("click", () => {
        const orig = findOriginal(entity);
        if (!orig) return;
        const arr = mapData[col];
        if (col === "torches") {
          const idx = mapData.torches.positions.indexOf(orig);
          if (idx >= 0) mapData.torches.positions.splice(idx, 1);
        } else {
          const idx = arr.indexOf(orig);
          if (idx >= 0) arr.splice(idx, 1);
        }
        selectedEntity = null;
        showProperties(null);
        render();
      });
    }

    render();
  }

  function updateCursorDisplay(wx, wy) {
    document.getElementById("cursor-pos").textContent = `${Math.round(wx)}, ${Math.round(wy)}`;
  }

  function updateZoomDisplay() {
    document.getElementById("zoom-display").textContent = `${Math.round(camera.zoom * 100)}%`;
  }

  function setTool(tool) {
    currentTool = tool;
    document.querySelectorAll(".tool-btn").forEach((b) => {
      b.classList.toggle("active", b.dataset.tool === tool);
    });
    canvas.style.cursor = tool === "pan" ? "grab" : tool === "select" ? "default" : "crosshair";
  }

  canvas.addEventListener("mousedown", (e) => {
    if (!mapData) return;
    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const w = screenToWorld(sx, sy);

    if (currentTool === "pan" || e.button === 1 || (e.button === 0 && e.altKey)) {
      isPanning = true;
      panStart = { x: e.clientX, y: e.clientY };
      panCameraStart = { x: camera.x, y: camera.y };
      canvas.style.cursor = "grabbing";
      return;
    }

    if (currentTool === "select") {
      const hit = hitTest(w.x, w.y);
      if (hit) {
        showProperties(hit);
        isDragging = true;
        dragStart = { x: w.x, y: w.y };
        dragEntityStart = { x: hit.x, y: hit.y };
      } else {
        showProperties(null);
      }
    }
  });

  canvas.addEventListener("mousemove", (e) => {
    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const w = screenToWorld(sx, sy);
    updateCursorDisplay(w.x, w.y);

    if (isPanning) {
      const dx = (e.clientX - panStart.x) / camera.zoom;
      const dy = (e.clientY - panStart.y) / camera.zoom;
      camera.x = panCameraStart.x - dx;
      camera.y = panCameraStart.y - dy;
      render();
      return;
    }

    if (isDragging && selectedEntity) {
      const dx = w.x - dragStart.x;
      const dy = w.y - dragStart.y;
      selectedEntity.x = Math.round(dragEntityStart.x + dx);
      selectedEntity.y = Math.round(dragEntityStart.y + dy);
      const orig = findOriginal(selectedEntity);
      if (orig && orig !== selectedEntity) {
        orig.x = selectedEntity.x;
        orig.y = selectedEntity.y;
      }
      render();
      showProperties(selectedEntity);
    }
  });

  canvas.addEventListener("mouseup", () => {
    isDragging = false;
    isPanning = false;
    if (currentTool === "pan") canvas.style.cursor = "grab";
  });

  canvas.addEventListener("wheel", (e) => {
    e.preventDefault();
    const factor = e.deltaY > 0 ? 0.9 : 1.1;
    const newZoom = Math.max(0.05, Math.min(5, camera.zoom * factor));
    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const wx = (sx - canvas.width / 2) / camera.zoom + camera.x;
    const wy = (sy - canvas.height / 2) / camera.zoom + camera.y;
    camera.zoom = newZoom;
    camera.x = wx - (sx - canvas.width / 2) / camera.zoom;
    camera.y = wy - (sy - canvas.height / 2) / camera.zoom;
    updateZoomDisplay();
    render();
  }, { passive: false });

  document.querySelectorAll(".tool-btn").forEach((btn) => {
    btn.addEventListener("click", () => setTool(btn.dataset.tool));
  });

  document.addEventListener("keydown", (e) => {
    if (e.target.tagName === "INPUT" || e.target.tagName === "SELECT") return;
    if (e.key === "v" || e.key === "V") setTool("select");
    if (e.key === "h" || e.key === "H") setTool("pan");
    if (e.key === "r" || e.key === "R") setTool("add-rect");
    if (e.key === "p" || e.key === "P") setTool("add-point");
    if (e.key === "Delete" || e.key === "Backspace") {
      if (selectedEntity) {
        const col = selectedEntity._collection;
        if (col) {
          const orig = findOriginal(selectedEntity);
          if (orig) {
            const arr = col === "torches" ? mapData.torches.positions : mapData[col];
            const idx = arr.indexOf(orig);
            if (idx >= 0) arr.splice(idx, 1);
          }
          showProperties(null);
        }
      }
    }
    if (e.key === "Escape") {
      showProperties(null);
      setTool("select");
    }
  });

  canvas.addEventListener("dblclick", (e) => {
    if (!mapData || currentTool !== "select") return;
    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const w = screenToWorld(sx, sy);
    const hit = hitTest(w.x, w.y);
    if (hit) showProperties(hit);
  });

  function sanitizeTsToJson(text) {
    let s = text;
    s = s.replace(/\/\*[\s\S]*?\*\//g, "");
    s = s.replace(/\/\/[^\n]*/g, "");
    s = s.replace(/Math\.PI\s*\/\s*3/g, String(Math.PI / 3));
    s = s.replace(/Math\.PI/g, String(Math.PI));
    s = s.replace(/,(\s*[}\]])/g, "$1");
    s = s.trim();
    return s;
  }

  function quoteKeys(s) {
    return s.replace(/([{,]\s*)([a-zA-Z_]\w*)\s*:/g, '$1"$2":');
  }

  function extractMapObject(text) {
    const mapIdx = text.indexOf("DEFAULT_MAP");
    if (mapIdx === -1) {
      const m = text.match(/\{[\s\S]*\}/);
      return m ? m[0] : text;
    }
    const start = text.indexOf("{", mapIdx);
    if (start === -1) return null;
    let depth = 0;
    for (let i = start; i < text.length; i++) {
      if (text[i] === "{") depth++;
      if (text[i] === "}") depth--;
      if (depth === 0) return text.substring(start, i + 1);
    }
    return null;
  }

  function loadMapFromText(text) {
    try {
      let raw = text;
      if (text.includes("Math.") || text.includes("//") || text.includes("export") || text.includes("MapData")) {
        raw = sanitizeTsToJson(text);
      }
      let json = extractMapObject(raw);
      if (!json) throw new Error("Could not find map object in file");
      json = quoteKeys(json);
      mapData = JSON.parse(json);
      document.getElementById("btn-export").disabled = false;
      document.getElementById("set-width").value = mapData.width;
      document.getElementById("set-height").value = mapData.height;
      document.getElementById("set-surfaceCY").value = mapData.surfaceCenterY;
      document.getElementById("set-bossArena").value = mapData.bossArenaSize;
      centerView();
      showProperties(null);
      render();
      return true;
    } catch (err) {
      alert("Failed to parse map file: " + err.message);
      return false;
    }
  }

  document.getElementById("btn-import").addEventListener("click", () => {
    const input = document.createElement("textarea");
    input.placeholder = "Paste your map JSON or TypeScript here...\n\nOr drag a .ts/.json file onto the canvas.";
    input.style.cssText = "position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);width:500px;height:300px;z-index:1000;background:#16213e;color:#e0e0e0;border:2px solid #e94560;padding:12px;font-family:monospace;font-size:12px;border-radius:8px;";
    const loadBtn = document.createElement("button");
    loadBtn.textContent = "Load Map";
    loadBtn.style.cssText = "position:fixed;top:calc(50% + 160px);left:50%;transform:translateX(-50%);z-index:1000;padding:8px 24px;background:#e94560;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:14px;";
    const cancelBtn = document.createElement("button");
    cancelBtn.textContent = "Cancel";
    cancelBtn.style.cssText = "position:fixed;top:calc(50% + 160px);left:calc(50% + 100px);transform:translateX(-50%);z-index:1000;padding:8px 24px;background:#333;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:14px;";
    const overlay = document.createElement("div");
    overlay.style.cssText = "position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.6);z-index:999;";
    overlay.addEventListener("click", cleanup);
    cancelBtn.addEventListener("click", cleanup);
    loadBtn.addEventListener("click", () => {
      if (input.value.trim()) {
        loadMapFromText(input.value.trim());
      }
      cleanup();
    });
    function cleanup() {
      overlay.remove();
      input.remove();
      loadBtn.remove();
      cancelBtn.remove();
    }
    document.body.appendChild(overlay);
    document.body.appendChild(input);
    document.body.appendChild(loadBtn);
    document.body.appendChild(cancelBtn);
    input.focus();
  });

  canvas.addEventListener("dragover", (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    canvas.style.outline = "3px dashed #e94560";
  });

  canvas.addEventListener("dragleave", () => {
    canvas.style.outline = "";
  });

  canvas.addEventListener("drop", (e) => {
    e.preventDefault();
    canvas.style.outline = "";
    const file = e.dataTransfer.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => loadMapFromText(reader.result);
      reader.readAsText(file);
    }
  });

  document.getElementById("btn-export").addEventListener("click", () => {
    if (!mapData) return;
    const json = JSON.stringify(mapData, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "mapData.json";
    a.click();
    URL.revokeObjectURL(url);
  });

  document.getElementById("btn-new").addEventListener("click", () => {
    if (!confirm("Create a new blank map? This will discard unsaved changes.")) return;
    mapData = {
      width: 2000,
      height: 2600,
      surfaceCenterY: 1000,
      bossArenaSize: 1000,
      cave: {
        rect: { x: 0, y: 2000, w: 2000, h: 600 },
        entry: { x: 900, w: 200 },
        doorCost: 1500,
        generatorPos: { x: 1000, y: 2480 },
        generatorInteractDistance: 80,
        generatorHoldMs: 20000,
        totemPos: { x: 1700, y: 2460 },
      },
      golfRoom: {
        rect: { x: 0, y: 0, w: 2000, h: 450 },
        entry: { x: 900, w: 200 },
        doorCost: 1000,
      },
      flashlight: { coneAngle: 1.047, length: 430 },
      torches: { positions: [], lightRadius: 180 },
      doorHoldMs: 1500,
      revive: { holdMs: 3000, hp: 50 },
      buyStations: [],
      ammoBoxes: [],
      golfHoles: [],
      obstacles: [],
      caveLights: [],
      bossLava: [],
    };
    document.getElementById("btn-export").disabled = false;
    document.getElementById("set-width").value = mapData.width;
    document.getElementById("set-height").value = mapData.height;
    document.getElementById("set-surfaceCY").value = mapData.surfaceCenterY;
    document.getElementById("set-bossArena").value = mapData.bossArenaSize;
    centerView();
    showProperties(null);
    render();
  });

  document.getElementById("btn-reset-view").addEventListener("click", () => {
    centerView();
    render();
  });

  function centerView() {
    if (!mapData) return;
    camera.x = mapData.width / 2;
    camera.y = mapData.height / 2;
    const scaleX = canvas.width / (mapData.width + 200);
    const scaleY = canvas.height / (mapData.height + 200);
    camera.zoom = Math.min(scaleX, scaleY, 1);
    updateZoomDisplay();
  }

  ["set-width", "set-height", "set-surfaceCY", "set-bossArena"].forEach((id) => {
    document.getElementById(id).addEventListener("change", (e) => {
      if (!mapData) return;
      const v = +e.target.value;
      if (id === "set-width") mapData.width = v;
      if (id === "set-height") mapData.height = v;
      if (id === "set-surfaceCY") mapData.surfaceCenterY = v;
      if (id === "set-bossArena") mapData.bossArenaSize = v;
      render();
    });
  });

  document.getElementById("btn-add-entity").addEventListener("click", () => {
    if (!mapData) { alert("Import or create a map first."); return; }
    const type = document.getElementById("add-type").value;
    const cx = mapData.width / 2;
    const cy = mapData.height / 2;
    let entity = null;
    switch (type) {
      case "rock": case "crate": case "fence": case "barrel": case "toxicBarrel": case "caveWall": case "door": case "golfDoor":
        entity = { x: cx, y: cy, w: 50, h: 50, type };
        if (type === "barrel" || type === "toxicBarrel") entity.hp = 50;
        mapData.obstacles.push(entity);
        selectedEntity = { ...entity, _kind: "rect", _collection: "obstacles" };
        break;
      case "buyStation":
        entity = { x: cx, y: cy, weapon: "smg" };
        mapData.buyStations.push(entity);
        selectedEntity = { x: cx, y: cy, w: 80, h: 80, _kind: "rect", _collection: "buyStations", _ref: entity };
        break;
      case "ammoBox":
        entity = { x: cx, y: cy };
        mapData.ammoBoxes.push(entity);
        selectedEntity = { ...entity, _kind: "point", _collection: "ammoBoxes" };
        break;
      case "golfHole":
        entity = { x: cx, y: cy };
        mapData.golfHoles.push(entity);
        selectedEntity = { ...entity, _kind: "point", _collection: "golfHoles" };
        break;
      case "torch":
        entity = { x: cx, y: cy };
        mapData.torches.positions.push(entity);
        selectedEntity = { ...entity, _kind: "point", _collection: "torches" };
        break;
      case "caveLight":
        entity = { x: cx, y: cy };
        mapData.caveLights.push(entity);
        selectedEntity = { ...entity, _kind: "point", _collection: "caveLights" };
        break;
      case "bossLava":
        entity = { x: cx, y: cy, w: 100, h: 80 };
        mapData.bossLava.push(entity);
        selectedEntity = { ...entity, _kind: "rect", _collection: "bossLava" };
        break;
    }
    setTool("select");
    showProperties(selectedEntity);
    render();
  });

  initLayers();
  resizeCanvas();
  window.addEventListener("resize", resizeCanvas);
})();
