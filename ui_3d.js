// LNGC GTT Mark III Flex - 3D Ship, Trunk Deck, Piping & Manifold Renderer (7-Bit ASCII)
window.lngc3D = {
  yaw: -0.64, pitch: 0.40, zoom: 1.18, panX: 0, panY: 12,
  viewMode: "ISO", // "ISO", "PROFILE", "PLAN", "XSECT"
  showHull: true, showTrunk: true, showPipes: true, showWbt: true,
  canvas: null, ctx: null, touchMode: "none",
  lastX: 0, lastY: 0, pinchDist: 0, panLastX: 0, panLastY: 0, animPhase: 0.0
};

function setCamPreset(mode) {
  const c = window.lngc3D;
  c.viewMode = mode;
  c.panX = 0; c.panY = 12;
  if (mode === "ISO") { c.yaw = -0.64; c.pitch = 0.40; c.zoom = 1.18; }
  else if (mode === "PROFILE") { c.yaw = 0.0; c.pitch = 0.04; c.zoom = 1.28; }
  else if (mode === "PLAN") { c.yaw = 0.0; c.pitch = 1.56; c.zoom = 1.24; }
  else if (mode === "XSECT") { c.zoom = 1.05; }
  sync3DButtons();
  draw3DHullFrame(window.latestState || window.simEngine.state);
}

function adjustZoom(delta) {
  const c = window.lngc3D;
  c.zoom = Math.max(0.45, Math.min(4.00, c.zoom + delta));
  const sl = document.getElementById("zoom-slider-3d");
  if (sl) sl.value = c.zoom.toFixed(2);
  draw3DHullFrame(window.latestState || window.simEngine.state);
}

function toggle3DLayer(prop) {
  window.lngc3D[prop] = !window.lngc3D[prop];
  sync3DButtons();
  draw3DHullFrame(window.latestState || window.simEngine.state);
}

function sync3DButtons() {
  const c = window.lngc3D;
  ["ISO", "PROFILE", "PLAN", "XSECT"].forEach(m => {
    const b = document.getElementById("btn-cam-" + m);
    if (b) b.className = (c.viewMode === m) ? "active" : "";
  });
  const map = { showHull: "btn-lay-hull", showTrunk: "btn-lay-trunk", showPipes: "btn-lay-pipes", showWbt: "btn-lay-wbt" };
  Object.keys(map).forEach(k => {
    const b = document.getElementById(map[k]);
    if (b) b.className = c[k] ? "active" : "";
  });
}

function project3D(x, y, z, w, h, trimRad, heelRad) {
  const c = window.lngc3D;
  const ct = Math.cos(trimRad), st = Math.sin(trimRad);
  const x1 = x * ct - y * st, y1 = x * st + y * ct;
  const ch = Math.cos(heelRad), sh = Math.sin(heelRad);
  const y2 = y1 * ch - z * sh, z2 = y1 * sh + z * ch;

  const cy = Math.cos(c.yaw), sy = Math.sin(c.yaw);
  const x3 = x1 * cy + z2 * sy, z3 = -x1 * sy + z2 * cy;
  const cp = Math.cos(c.pitch), sp = Math.sin(c.pitch);
  const y4 = y2 * cp - z3 * sp, z4 = y2 * sp + z3 * cp;

  const fov = 560.0 / Math.max(220.0, 560.0 - z4 * 0.62);
  const scale = (Math.min(w, h * 1.85) / 305.0) * c.zoom * fov;
  return { sx: w * 0.5 + c.panX + x3 * scale, sy: h * 0.55 + c.panY - y4 * scale, depth: z4 };
}

function octSectionYZ(halfBeam, yBot, yTop) {
  const h = yTop - yBot;
  const wBot = halfBeam * 0.64, wTop = halfBeam * 0.56;
  const yLow = yBot + h * 0.20, yHigh = yBot + h * 0.74;
  return [
    [yBot, -wBot], [yBot, wBot], [yLow, halfBeam], [yHigh, halfBeam],
    [yTop, wTop], [yTop, -wTop], [yHigh, -halfBeam], [yLow, -halfBeam]
  ];
}

// Ship half-breadth curve z(x, y) for 285m LNGC hull stations (-142m stern to +144m bow)
function hullHalfBeam(x, y) {
  const flare = Math.max(0.0, (y + 11.5) / 21.0);
  if (x > 80.0) {
    const u = Math.min(1.0, (x - 80.0) / 64.0);
    const deckB = 23.2 * (1.0 - Math.pow(u, 1.65));
    const keelB = 19.5 * Math.max(0.0, 1.0 - Math.pow(u * 1.08, 1.45));
    return keelB + (deckB - keelB) * flare;
  } else if (x < -92.0) {
    const u = Math.min(1.0, (-92.0 - x) / 50.0);
    const deckB = 23.2 * (1.0 - 0.52 * Math.pow(u, 1.8));
    const keelB = 19.5 * (1.0 - 0.88 * Math.pow(u, 1.35));
    return keelB + (deckB - keelB) * flare;
  }
  return 19.8 + (23.2 - 19.8) * Math.pow(flare, 0.75);
}

function bindCanvasTouch(canvas) {
  const c = window.lngc3D;
  canvas.addEventListener("touchstart", e => {
    if (e.touches.length === 1) {
      c.touchMode = "orbit"; c.lastX = e.touches[0].clientX; c.lastY = e.touches[0].clientY;
    } else if (e.touches.length >= 2) {
      c.touchMode = "pinch";
      c.pinchDist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY) || 1.0;
      c.panLastX = (e.touches[0].clientX + e.touches[1].clientX) * 0.5;
      c.panLastY = (e.touches[0].clientY + e.touches[1].clientY) * 0.5;
    }
  }, { passive: false });

  canvas.addEventListener("touchmove", e => {
    e.preventDefault();
    if (c.touchMode === "orbit" && e.touches.length === 1) {
      const dx = e.touches[0].clientX - c.lastX, dy = e.touches[0].clientY - c.lastY;
      if (c.viewMode === "XSECT") { c.panX += dx; c.panY += dy; }
      else { c.yaw += dx * 0.0075; c.pitch = Math.max(-0.25, Math.min(1.56, c.pitch + dy * 0.0075)); }
      c.lastX = e.touches[0].clientX; c.lastY = e.touches[0].clientY;
    } else if (e.touches.length >= 2) {
      const dist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY) || 1.0;
      c.zoom = Math.max(0.45, Math.min(4.00, c.zoom * (dist / c.pinchDist)));
      c.pinchDist = dist;
      const mx = (e.touches[0].clientX + e.touches[1].clientX) * 0.5, my = (e.touches[0].clientY + e.touches[1].clientY) * 0.5;
      c.panX += (mx - c.panLastX); c.panY += (my - c.panLastY);
      c.panLastX = mx; c.panLastY = my;
      const sl = document.getElementById("zoom-slider-3d");
      if (sl) sl.value = c.zoom.toFixed(2);
    }
    draw3DHullFrame(window.latestState || window.simEngine.state);
  }, { passive: false });

  canvas.addEventListener("touchend", e => {
    if (e.touches.length === 1) { c.touchMode = "orbit"; c.lastX = e.touches[0].clientX; c.lastY = e.touches[0].clientY; }
    else if (e.touches.length === 0) c.touchMode = "none";
  });
}

function bindCanvasMouse(canvas) {
  const c = window.lngc3D;
  let down = false;
  canvas.addEventListener("mousedown", e => { down = true; c.lastX = e.clientX; c.lastY = e.clientY; });
  window.addEventListener("mouseup", () => { down = false; });
  canvas.addEventListener("mousemove", e => {
    if (!down) return;
    const dx = e.clientX - c.lastX, dy = e.clientY - c.lastY;
    if (e.shiftKey || c.viewMode === "XSECT") { c.panX += dx; c.panY += dy; }
    else { c.yaw += dx * 0.007; c.pitch = Math.max(-0.25, Math.min(1.56, c.pitch + dy * 0.007)); }
    c.lastX = e.clientX; c.lastY = e.clientY;
    draw3DHullFrame(window.latestState || window.simEngine.state);
  });
  canvas.addEventListener("wheel", e => {
    e.preventDefault(); adjustZoom(e.deltaY < 0 ? 0.14 : -0.14);
  }, { passive: false });
}

function buildHullAndWater(st, addPoly, addLine) {
  const ySea = -11.5 + (st.hydro.dm || 11.5);
  const xs = [-140, -124, -106, -80, -45, 0, 45, 80, 106, 126, 142];

  if (window.lngc3D.showHull) {
    // 1. Multi-station Hull Plating: Submerged Anti-Fouling Boot-Top vs Topsides Freeboard
    for (let i = 0; i < xs.length - 1; i++) {
      const x0 = xs[i], x1 = xs[i + 1];
      const bK0 = hullHalfBeam(x0, -11.5), bK1 = hullHalfBeam(x1, -11.5);
      const bW0 = hullHalfBeam(x0, 0.0),   bW1 = hullHalfBeam(x1, 0.0);
      const bD0 = hullHalfBeam(x0, 9.5),   bD1 = hullHalfBeam(x1, 9.5);
      // Submerged lower hull (reddish-brown anti-fouling)
      [-1, 1].forEach(s => {
        addPoly([[x0,-11.5,s*bK0],[x1,-11.5,s*bK1],[x1,0.0,s*bW1],[x0,0.0,s*bW0]],
                "rgba(135, 38, 42, 0.34)", "rgba(210, 75, 80, 0.45)", 1.0);
        // Topsides hull plating (marine navy blue-grey)
        addPoly([[x0,0.0,s*bW0],[x1,0.0,s*bW1],[x1,9.5,s*bD1],[x0,9.5,s*bD0]],
                "rgba(20, 48, 82, 0.38)", "rgba(75, 135, 200, 0.60)", 1.2);
      });
      // Main weather deck framing
      addPoly([[x0,9.5,-bD0],[x1,9.5,-bD1],[x1,9.5,bD1],[x0,9.5,bD0]],
              "rgba(18, 38, 62, 0.42)", "rgba(65, 115, 170, 0.45)", 1.0);
    }

    // 2. Bulbous Bow & Raised Forecastle Deck + Transom Stern
    addPoly([[134,-11.2,-3.8],[147,-8.2,0],[134,-5.0,-4.2]], "rgba(165,45,50,0.55)", "#e0555a", 1.3);
    addPoly([[134,-11.2, 3.8],[147,-8.2,0],[134,-5.0, 4.2]], "rgba(165,45,50,0.55)", "#e0555a", 1.3);
    addPoly([[106,9.5,-17.5],[142,13.0,0],[106,9.5,17.5]], "rgba(32,68,108,0.62)", "#589ce0", 1.5);
    addPoly([[-140,0.0,-11.5],[-140,9.5,-11.5],[-140,9.5,11.5],[-140,0.0,11.5]], "rgba(22,48,80,0.55)", "#4a85c5", 1.3);

    // 3. Aft Accommodation Superstructure, Bridge Wings & Twin Funnels (Port ME / Stbd GCU)
    const addBox = (x0,x1,y0,y1,z0,z1,f,s,lw) => {
      addPoly([[x0,y1,z0],[x1,y1,z0],[x1,y1,z1],[x0,y1,z1]], f, s, lw);
      addPoly([[x0,y0,z1],[x1,y0,z1],[x1,y1,z1],[x0,y1,z1]], f, s, lw);
      addPoly([[x0,y0,z0],[x1,y0,z0],[x1,y1,z0],[x0,y1,z0]], f, s, lw);
      addPoly([[x1,y0,z0],[x1,y1,z0],[x1,y1,z1],[x1,y0,z1]], f, s, lw);
      addPoly([[x0,y0,z0],[x0,y1,z0],[x0,y1,z1],[x0,y0,z1]], f, s, lw);
    };
    addBox(-132, -108, 9.5, 23.5, -16.5, 16.5, "rgba(200,218,238,0.65)", "#8ab4e1", 1.3);
    addBox(-118, -110, 23.5, 29.5, -21.5, 21.5, "rgba(225,240,255,0.82)", "#00d4ff", 1.5); // Navigation Bridge
    addBox(-130, -121, 23.5, 33.5, -9.0, -3.2, "rgba(28,62,102,0.85)", "#4fa3e3", 1.3);  // Port ME Funnel
    const gcuHot = st.gcu && st.gcu.burn_kgs > 0.05;
    addBox(-130, -121, 23.5, 33.5,  3.2,  9.0, gcuHot ? "rgba(255,95,35,0.85)" : "rgba(28,62,102,0.85)",
           gcuHot ? "#ffab00" : "#4fa3e3", 1.4); // Stbd GCU Funnel

    // 4. Emphasized Ocean Water Surface Plane, Wave Ripples & Glowing Waterline Hull Contour
    addPoly([[-160,ySea,-48],[160,ySea,-48],[160,ySea,48],[-160,ySea,48]],
            "rgba(0, 140, 225, 0.22)", "rgba(0, 212, 255, 0.55)", 1.5);
    for (let gx = -140; gx <= 140; gx += 28) addLine([gx, ySea, -46], [gx, ySea, 46], "rgba(0, 212, 255, 0.22)", 1.0);
    for (let gz = -40; gz <= 40; gz += 16) addLine([-155, ySea, gz], [155, ySea, gz], "rgba(0, 212, 255, 0.22)", 1.0);
    // Glowing Cyan Waterline Ring directly around the hull at ySea
    for (let i = 0; i < xs.length - 1; i++) {
      const b0 = hullHalfBeam(xs[i], ySea), b1 = hullHalfBeam(xs[i+1], ySea);
      addLine([xs[i], ySea + 0.15, -b0], [xs[i+1], ySea + 0.15, -b1], "#00ffff", 2.6);
      addLine([xs[i], ySea + 0.15,  b0], [xs[i+1], ySea + 0.15,  b1], "#00ffff", 2.6);
    }
  }
}

function buildTrunkAndTanks(st, addPoly, addLine, addOctPrism) {
  const tX = [ [56, 101], [4, 51], [-49, -2], [-102, -55] ];
  const tW = [ [18.8, 14.8], [19.2, 19.2], [19.2, 19.2], [18.6, 19.2] ];

  // 1. Double-Hull U-Shaped WBT Floor & Wing Tanks
  if (window.lngc3D.showWbt) {
    tX.forEach((xr, i) => {
      const wfP = (st.wbt_fill ? st.wbt_fill[i*2] : 15) / 100.0;
      const wfS = (st.wbt_fill ? st.wbt_fill[i*2+1] : 15) / 100.0;
      addPoly([[xr[0],-11.5,-21],[xr[1],-11.5,-21],[xr[1],-11.5+8.5*wfP,-21],[xr[0],-11.5+8.5*wfP,-21]],
              "rgba(0,115,220,0.32)", "rgba(0,180,255,0.50)", 1.0);
      addPoly([[xr[0],-11.5, 21],[xr[1],-11.5, 21],[xr[1],-11.5+8.5*wfS, 21],[xr[0],-11.5+8.5*wfS, 21]],
              "rgba(0,115,220,0.32)", "rgba(0,180,255,0.50)", 1.0);
    });
  }

  // 2. Continuous Raised Tank Trunk Deck & Cofferdam Bulkheads
  if (window.lngc3D.showTrunk) {
    addPoly([[-105,17.8,-11.2],[103,17.8,-11.2],[103,17.8,11.2],[-105,17.8,11.2]],
            "rgba(32, 62, 96, 0.42)", "#589ce0", 1.8);
    addPoly([[-105,9.5,-17.5],[103,9.5,-17.5],[103,17.8,-11.2],[-105,17.8,-11.2]],
            "rgba(24, 48, 76, 0.30)", "#3f74a8", 1.2);
    addPoly([[-105,9.5, 17.5],[103,9.5, 17.5],[103,17.8, 11.2],[-105,17.8, 11.2]],
            "rgba(24, 48, 76, 0.30)", "#3f74a8", 1.2);
    [-103, -52, 1, 53.5, 102].forEach(cx => {
      addLine([cx, 9.5, -17.5], [cx, 17.8, -11.2], "#629cd4", 1.5);
      addLine([cx, 9.5,  17.5], [cx, 17.8,  11.2], "#629cd4", 1.5);
      addLine([cx, 17.8, -11.2], [cx, 17.8, 11.2], "#629cd4", 1.5);
    });
  }

  // 3. 4x Octagonal Membrane Tanks, Liquid LNG Pools, Trunk Top Coamings & Liquid/Vapor Domes
  st.tanks.forEach((t, i) => {
    const x0 = tX[i][0], x1 = tX[i][1], w0 = tW[i][0], w1 = tW[i][1], xMid = (x0 + x1) * 0.5;
    if (t.fill > 0.5) {
      const yLiq = -9.2 + Math.min(0.985, t.fill / 100.0) * 26.2;
      addOctPrism(x0+0.4, x1-0.4, w0*0.97, w1*0.97, -9.2, yLiq,
                  t.slosh ? "rgba(255,171,0,0.62)" : "rgba(0,195,255,0.60)",
                  t.slosh ? "#ffab00" : "#00e5ff", 1.4);
    }
    addOctPrism(x0, x1, w0, w1, -9.2, 17.2,
                t.is_ch4 > 5.0 ? "rgba(255,61,87,0.24)" : "rgba(0,212,255,0.08)",
                t.is_ch4 > 5.0 ? "#ff3d57" : "rgba(0,212,255,0.72)", 1.5);
    // Tank Trunk Top Coaming, Liquid Dome (Aft) & Vapor Dome (Fwd) + Internal Pump Tower
    const xLiqDome = x0 + 7.5, xVapDome = xMid + 4.0;
    addPoly([[x0+3,18.0,-6.5],[x1-3,18.0,-6.5],[x1-3,18.0,6.5],[x0+3,18.0,6.5]],
            "rgba(42,82,122,0.58)", "#7bc0ff", 1.4); // Tank Trunk Top
    addPoly([[xLiqDome-2.5,19.6,-2.5],[xLiqDome+2.5,19.6,-2.5],[xLiqDome+2.5,19.6,2.5],[xLiqDome-2.5,19.6,2.5]],
            "rgba(0,229,255,0.85)", "#ffffff", 1.5); // Liquid Dome
    addPoly([[xVapDome-2.0,19.4,-2.0],[xVapDome+2.0,19.4,-2.0],[xVapDome+2.0,19.4,2.0],[xVapDome-2.0,19.4,2.0]],
            "rgba(255,171,0,0.85)", "#ffffff", 1.4); // Vapor Dome
    addLine([xLiqDome, -9.0, 0], [xLiqDome, 19.6, 0], "#e2f1ff", 2.8); // Pump Tower Shaft
  });
}

function buildDeckPipingAndMachinery(st, addPoly, addLine) {
  if (!window.lngc3D.showPipes) return;
  const tX = [ [56, 101], [4, 51], [-49, -2], [-102, -55] ];
  const phase = window.lngc3D.animPhase;

  // 1. Cargo Compressor Room & Electric Motor Room Deckhouse (On Trunk Deck x = -56 to -44)
  const compRun = st.comp && st.comp.some(c => c.run);
  const compCol = compRun ? "rgba(0, 230, 118, 0.55)" : "rgba(45, 75, 110, 0.72)";
  const compBdr = compRun ? "#00e676" : "#7bc0ff";
  // Compressor Room (Stbd/Center z = -3 to +9.5) & Motor Room (Port z = -9.5 to -3)
  addPoly([[-56,22.8,-3.0],[-44,22.8,-3.0],[-44,22.8,9.5],[-56,22.8,9.5]], compCol, compBdr, 1.8);
  addPoly([[-56,17.8, 9.5],[-44,17.8, 9.5],[-44,22.8,9.5],[-56,22.8,9.5]], compCol, compBdr, 1.5);
  addPoly([[-56,22.2,-9.5],[-44,22.2,-9.5],[-44,22.2,-3.0],[-56,22.2,-3.0]], "rgba(65,105,155,0.72)", "#9ec2e6", 1.5);
  addPoly([[-56,17.8,-9.5],[-44,17.8,-9.5],[-44,22.2,-9.5],[-56,22.2,-9.5]], "rgba(65,105,155,0.72)", "#9ec2e6", 1.4);

  // 2. Midship Port & Starboard Cryogenic Manifolds (x = -5 to +5, z = -23.5 to +23.5)
  const mMode = st.manifold ? st.manifold.mode : 0;
  const esdOk = !st.esd1;
  const maniCol = !esdOk ? "rgba(255,61,87,0.80)" : (mMode > 0 ? "rgba(0,230,118,0.80)" : "rgba(0,212,255,0.65)");
  // Port & Starboard Manifold Drip Trays & Quick-Connect Flanges
  addPoly([[-5.5,11.5,-23.6],[5.5,11.5,-23.6],[5.5,11.5,-17.5],[-5.5,11.5,-17.5]], maniCol, "#ffffff", 1.6);
  addPoly([[-5.5,11.5, 17.5],[5.5,11.5, 17.5],[5.5,11.5, 23.6],[-5.5,11.5, 23.6]], maniCol, "#ffffff", 1.6);
  // 4 Liquid Crossover Pipes + 1 Vapor Return Crossover Pipe across Midship Trunk Deck
  [-4.0, -2.0, 0.0, 2.0].forEach(mx => {
    addLine([mx, 18.6, -23.4], [mx, 18.6, 23.4], "#00e5ff", 2.4);
    addLine([mx, 18.6, -23.4], [mx, 11.5, -23.4], "#00e5ff", 2.2);
    addLine([mx, 18.6,  23.4], [mx, 11.5,  23.4], "#00e5ff", 2.2);
  });
  addLine([4.2, 19.0, -23.4], [4.2, 19.0, 23.4], "#ff4081", 2.4); // Vapor Return Crossover
  addLine([4.2, 19.0, -23.4], [4.2, 11.5, -23.4], "#ff4081", 2.2);
  addLine([4.2, 19.0,  23.4], [4.2, 11.5,  23.4], "#ff4081", 2.2);

  // 3. 4x Vent Mast Risers (MAST #1 - #4) with A-Frame Supports & Relief Plumes
  st.tanks.forEach((t, i) => {
    const xMast = tX[i][1] - 4.5;
    const marv = t.p_dome >= 25.0;
    addLine([xMast, 17.8, 0.0], [xMast, 30.8, 0.0], marv ? "#ff3d57" : "#dce8f8", 3.0);
    addLine([xMast - 2.5, 17.8, -3.2], [xMast, 27.5, 0.0], "#8ab4e1", 1.4);
    addLine([xMast - 2.5, 17.8,  3.2], [xMast, 27.5, 0.0], "#8ab4e1", 1.4);
    // Vent hood crown
    addLine([xMast - 1.2, 30.8, 0.0], [xMast + 1.2, 30.8, 0.0], marv ? "#ff3d57" : "#ffab00", 3.5);
  });

  // 4. All 6 Longitudinal Cryogenic Deck Piping Headers along Trunk Top
  const liqFlow = Math.abs(st.manifold ? st.manifold.shore_liq_kgs : 0) > 1.0 ||
                  st.tanks.some(t => t.p1_amps > 10 || t.p2_amps > 10);
  const vapFlow = compRun;
  // (A) Main Liquid Header (Cyan #00e5ff, z = +5.2m)
  addLine([-96, 18.8, 5.2], [96, 18.8, 5.2], "#00e5ff", 3.2, liqFlow ? [8, 5] : null, phase);
  // (B) Common Vapor / BOG Header (Amber #ffab00, z = -4.8m)
  addLine([-96, 19.2, -4.8], [96, 19.2, -4.8], "#ffab00", 2.8, vapFlow ? [7, 5] : null, -phase);
  // (C) Stripping / Spray Header (Light Blue #40c4ff, z = +3.0m)
  addLine([-96, 18.5, 3.0], [96, 18.5, 3.0], "#40c4ff", 1.8, [4, 4]);
  // (D) Shore Vapor Return Line from Comp Room to Midship Manifold (Magenta #ff4081, z = -2.2m)
  addLine([-46, 19.5, -2.2], [4.2, 19.5, -2.2], "#ff4081", 2.4, (st.manifold && st.manifold.shore_vap_kgs > 0.1) ? [6, 4] : null, phase);
  // (E) Fuel Gas Supply Line from Comp Room Aft to Engine Room & GCU (Green #00e676, z = +1.2m)
  addLine([-125, 19.5, 1.2], [-50, 19.5, 1.2], "#00e676", 2.4, [6, 4], -phase);
  // (F) Nitrogen (N2) Insulation Space Bleed Header (Purple #b388ff, z = -8.5m)
  addLine([-98, 18.3, -8.5], [98, 18.3, -8.5], "#b388ff", 1.6);

  // Branch Connections from Each Tank Dome to the Longitudinal Headers & Mast Risers
  st.tanks.forEach((t, i) => {
    const xLiqDome = tX[i][0] + 7.5, xVapDome = (tX[i][0] + tX[i][1]) * 0.5 + 4.0, xMast = tX[i][1] - 4.5;
    addLine([xLiqDome, 19.0, 0.0], [xLiqDome, 18.8, 5.2], "#00e5ff", 2.2);   // Liquid branch
    addLine([xLiqDome, 18.6, 0.0], [xLiqDome, 18.5, 3.0], "#40c4ff", 1.6);   // Spray branch
    addLine([xVapDome, 19.2, 0.0], [xVapDome, 19.2, -4.8], "#ffab00", 2.2);  // Vapor branch
    addLine([xMast, 21.0, 0.0], [xMast, 19.2, -4.8], "#ffab00", 1.8);        // Mast riser feed
  });
}

function draw3DOverview(ctx, w, h, st) {
  window.lngc3D.animPhase = (window.lngc3D.animPhase + 1.5) % 40.0;
  const trimRad = Math.atan2(st.hydro.trim || 0, 285.0);
  const heelRad = ((st.hydro.heel || 0) * Math.PI) / 180.0;
  const proj = (x, y, z) => project3D(x, y, z, w, h, trimRad, heelRad);
  const queue = [];

  const addPoly = (pts3d, fill, stroke, lineW) => {
    const p2 = pts3d.map(p => proj(p[0], p[1], p[2]));
    const zAvg = p2.reduce((a, b) => a + b.depth, 0) / p2.length;
    queue.push({ type: "poly", pts: p2, fill, stroke, lineW: lineW || 1.0, depth: zAvg });
  };
  const addLine = (pA, pB, stroke, lineW, dash, dashOff) => {
    const a = proj(pA[0], pA[1], pA[2]), b = proj(pB[0], pB[1], pB[2]);
    queue.push({ type: "line", a, b, stroke, lineW: lineW || 1.2, dash, dashOff: dashOff || 0, depth: (a.depth + b.depth) * 0.5 });
  };
  const addOctPrism = (x0, x1, w0, w1, yBot, yTop, fill, stroke, lineW) => {
    const s0 = octSectionYZ(w0, yBot, yTop), s1 = octSectionYZ(w1, yBot, yTop);
    for (let i = 0; i < 8; i++) {
      const ni = (i + 1) % 8;
      addPoly([[x0,s0[i][0],s0[i][1]],[x1,s1[i][0],s1[i][1]],[x1,s1[ni][0],s1[ni][1]],[x0,s0[ni][0],s0[ni][1]]], fill, stroke, lineW);
    }
    addPoly(s0.map(yz => [x0, yz[0], yz[1]]), fill, stroke, lineW);
    addPoly(s1.map(yz => [x1, yz[0], yz[1]]), fill, stroke, lineW);
  };

  buildHullAndWater(st, addPoly, addLine);
  buildTrunkAndTanks(st, addPoly, addLine, addOctPrism);
  buildDeckPipingAndMachinery(st, addPoly, addLine);

  queue.sort((a, b) => a.depth - b.depth);
  queue.forEach(item => {
    ctx.beginPath();
    ctx.setLineDash(item.dash || []);
    ctx.lineDashOffset = item.dashOff || 0;
    if (item.type === "poly") {
      item.pts.forEach((p, idx) => idx === 0 ? ctx.moveTo(p.sx, p.sy) : ctx.lineTo(p.sx, p.sy));
      ctx.closePath();
      if (item.fill) { ctx.fillStyle = item.fill; ctx.fill(); }
      if (item.stroke) { ctx.strokeStyle = item.stroke; ctx.lineWidth = item.lineW; ctx.stroke(); }
    } else {
      ctx.moveTo(item.a.sx, item.a.sy); ctx.lineTo(item.b.sx, item.b.sy);
      ctx.strokeStyle = item.stroke; ctx.lineWidth = item.lineW; ctx.stroke();
    }
  });
  ctx.setLineDash([]); ctx.lineDashOffset = 0;

  // Callout Badges for CT1-CT4, Masts, Compressor Room, Manifold & Drafts
  const tX = [ [56, 101], [4, 51], [-49, -2], [-102, -55] ];
  st.tanks.forEach((t, i) => {
    const xMid = (tX[i][0] + tX[i][1]) * 0.5, p = proj(xMid, 24.5, 0);
    ctx.fillStyle = "rgba(6, 13, 24, 0.88)";
    ctx.strokeStyle = t.slosh ? "#ffab00" : (t.is_ch4 > 5 ? "#ff3d57" : "#00d4ff");
    ctx.lineWidth = 1.2; ctx.fillRect(p.sx - 54, p.sy - 14, 108, 28); ctx.strokeRect(p.sx - 54, p.sy - 14, 108, 28);
    ctx.fillStyle = "#fff"; ctx.font = "bold 10px monospace";
    ctx.fillText(`CT${t.id}:${t.fill.toFixed(1)}% M#${t.id}`, p.sx - 49, p.sy - 2);
    ctx.fillStyle = "#8ab4e1"; ctx.fillText(`${t.p_dome.toFixed(1)}kPa ${t.t_liq.toFixed(0)}\u00b0C`, p.sx - 49, p.sy + 10);
  });

  const pComp = proj(-50, 25.5, 3), pMani = proj(0, 14.5, 24.5), pGcu = proj(-126, 36.0, 6);
  ctx.font = "bold 10px monospace";
  ctx.fillStyle = "#00e676"; ctx.fillText("COMP/MOTOR RM", pComp.sx - 38, pComp.sy);
  ctx.fillStyle = "#00e5ff"; ctx.fillText("MANIFOLD P/S", pMani.sx - 36, pMani.sy);
  ctx.fillStyle = "#ffab00"; ctx.fillText("GCU/ME FUNNELS", pGcu.sx - 42, pGcu.sy);
  const pBow = proj(145, 2.0, 0), pStern = proj(-142, 2.0, 0);
  ctx.fillStyle = "#00ffff";
  ctx.fillText(`Tf ${st.hydro.df.toFixed(2)}m`, pBow.sx - 24, pBow.sy);
  ctx.fillText(`Ta ${st.hydro.da.toFixed(2)}m`, pStern.sx - 28, pStern.sy);
}

function drawMidshipXSection(ctx, w, h, st) {
  const t = st.tanks[1], cx = w * 0.5 + window.lngc3D.panX * 0.5, cy = h * 0.56 + window.lngc3D.panY * 0.5;
  const sc = Math.min(w, h) * 0.0092 * window.lngc3D.zoom;
  const pt = (z, y) => [cx + z * sc, cy - y * sc];
  const poly = (yz, f, s, lw, d) => {
    ctx.beginPath(); ctx.setLineDash(d || []);
    yz.forEach((p, i) => { const q = pt(p[1], p[0]); i === 0 ? ctx.moveTo(q[0], q[1]) : ctx.lineTo(q[0], q[1]); });
    ctx.closePath(); if (f) { ctx.fillStyle = f; ctx.fill(); }
    if (s) { ctx.strokeStyle = s; ctx.lineWidth = lw || 1.5; ctx.stroke(); }
    ctx.setLineDash([]);
  };
  // Waterline & Outer Hull + Raised Trunk Top + Dome + Mast Riser + Deck Piping
  const ySea = -11.5 + (st.hydro.dm || 11.5), wlL = pt(-34, ySea), wlR = pt(34, ySea);
  ctx.fillStyle = "rgba(0,140,225,0.22)"; ctx.fillRect(wlL[0], wlL[1], wlR[0] - wlL[0], pt(34, -14)[1] - wlL[1]);
  ctx.strokeStyle = "#00ffff"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(wlL[0], wlL[1]); ctx.lineTo(wlR[0], wlR[1]); ctx.stroke();
  poly([[-11.5,-22.5],[-11.5,22.5],[9.5,23.2],[18.0,11.5],[18.0,-11.5],[9.5,-23.2]], "rgba(16,34,58,0.88)", "#589ce0", 2.2);
  poly(octSectionYZ(20.0, -9.8, 17.5), "rgba(10,20,35,0.95)", t.is_ch4 > 5 ? "#ff3d57" : "#ffab00", 1.8, [5, 3]);
  const mem = octSectionYZ(19.2, -9.2, 17.0);
  poly(mem, "#060c16", "#00d4ff", 2.5);
  if (t.fill > 0.5) {
    const yLiq = -9.2 + Math.min(0.985, t.fill / 100.0) * 26.2;
    ctx.save(); ctx.beginPath(); mem.forEach((p, i) => { const q = pt(p[1], p[0]); i===0?ctx.moveTo(q[0],q[1]):ctx.lineTo(q[0],q[1]); }); ctx.clip();
    const tl = pt(-20, yLiq), br = pt(20, -9.5);
    ctx.fillStyle = t.slosh ? "rgba(255,171,0,0.62)" : "rgba(0,185,255,0.62)";
    ctx.fillRect(tl[0], tl[1], br[0] - tl[0], br[1] - tl[1]); ctx.restore(); poly(mem, null, "#00d4ff", 2.5);
  }
  poly([[17.0,-3.5],[17.0,3.5],[20.0,3.5],[20.0,-3.5]], "rgba(0,212,255,0.45)", "#fff", 1.5); // Tank Dome
  const pTop = pt(0, 20.0), pBot = pt(0, -8.8), pMast = pt(0, 29.0);
  ctx.strokeStyle = "#e2f1ff"; ctx.lineWidth = 3.5; ctx.beginPath(); ctx.moveTo(pTop[0], pTop[1]); ctx.lineTo(pBot[0], pBot[1]); ctx.stroke();
  ctx.strokeStyle = "#ffab00"; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(pTop[0], pTop[1]); ctx.lineTo(pMast[0], pMast[1]); ctx.stroke();
}

function render3DHullView(st) {
  const c = window.lngc3D;
  return `<div class="card">
    <div class="ctrl-row" style="margin-bottom:6px;flex-wrap:wrap;gap:5px;">
      <h3 style="border:none;margin:0;">GTT MARK III FLEX 3D HULL, TRUNK TOP, PIPING &amp; MANIFOLD</h3>
      <div style="display:flex;flex-wrap:wrap;gap:4px;">
        <button id="btn-cam-ISO" class="${c.viewMode==='ISO'?'active':''}" onclick="setCamPreset('ISO')">3D ISO</button>
        <button id="btn-cam-PROFILE" class="${c.viewMode==='PROFILE'?'active':''}" onclick="setCamPreset('PROFILE')">PROFILE</button>
        <button id="btn-cam-PLAN" class="${c.viewMode==='PLAN'?'active':''}" onclick="setCamPreset('PLAN')">DECK PLAN</button>
        <button id="btn-cam-XSECT" class="${c.viewMode==='XSECT'?'active':''}" onclick="setCamPreset('XSECT')">MIDSHIP X-SECT</button>
        <button id="btn-lay-hull" class="${c.showHull?'active':''}" onclick="toggle3DLayer('showHull')">HULL &amp; SEA</button>
        <button id="btn-lay-trunk" class="${c.showTrunk?'active':''}" onclick="toggle3DLayer('showTrunk')">TRUNK TOP</button>
        <button id="btn-lay-pipes" class="${c.showPipes?'active':''}" onclick="toggle3DLayer('showPipes')">PIPING/COMP/MASTS</button>
        <button id="btn-lay-wbt" class="${c.showWbt?'active':''}" onclick="toggle3DLayer('showWbt')">WBT</button>
      </div>
    </div>
    <canvas id="webgl-hull" style="width:100%;height:400px;background:#040912;border:1px solid #1e2f4d;border-radius:4px;touch-action:none;display:block;"></canvas>
    <div class="ctrl-row" style="margin-top:6px;flex-wrap:wrap;font-size:11px;">
      <span style="color:#00e5ff;">&#9644; Liquid Hdr</span>
      <span style="color:#ffab00;">&#9644; Vapor/BOG Hdr &amp; Masts</span>
      <span style="color:#ff4081;">&#9644; HD Shore Return</span>
      <span style="color:#00e676;">&#9644; Fuel Gas / Comp Rm</span>
      <span style="color:#40c4ff;">&#9644; Spray Line</span>
      <span style="color:#b388ff;">&#9644; N2 Barrier</span>
    </div>
    <div class="ctrl-row" style="margin-top:6px;flex-wrap:wrap;">
      <button onclick="adjustZoom(-0.20)">ZOOM &minus;</button>
      <input id="zoom-slider-3d" type="range" min="0.45" max="4.00" step="0.05" value="${c.zoom.toFixed(2)}" oninput="window.lngc3D.zoom=parseFloat(this.value);draw3DHullFrame(window.latestState||window.simEngine.state)">
      <button onclick="adjustZoom(0.20)">ZOOM +</button>
      <button onclick="setCamPreset('ISO')">RESET VIEW</button>
    </div>
  </div>`;
}

function draw3DHullFrame(st) {
  const canvas = document.getElementById("webgl-hull");
  if (!canvas) return;
  const c = window.lngc3D;
  if (c.canvas !== canvas) {
    c.canvas = canvas; c.ctx = canvas.getContext("2d");
    bindCanvasTouch(canvas); bindCanvasMouse(canvas);
  }
  const dpr = window.devicePixelRatio || 1, rect = canvas.getBoundingClientRect();
  const w = Math.max(300, rect.width), h = Math.max(240, rect.height);
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
  }
  const ctx = c.ctx;
  ctx.save(); ctx.scale(dpr, dpr);
  ctx.fillStyle = "#040912"; ctx.fillRect(0, 0, w, h);
  if (c.viewMode === "XSECT") drawMidshipXSection(ctx, w, h, st);
  else draw3DOverview(ctx, w, h, st);
  ctx.restore();
}
