// LNGC Membrane UI & Decluttered SVG Mimics (Views 1-12, 7-Bit ASCII)
const VIEWS = [
  "0:3D HULL", "1:CT1", "2:CT2", "3:CT3", "4:CT4", "5:BOG/GCU", "6:MANIFOLD",
  "7:WBT", "8:FGD/ESD", "9:LOAD", "10:BARRIER", "11:PRESETS", "12:OPS DATA"
];
let activeView = 0;

function initNav() {
  const nav = document.getElementById("navbar");
  nav.innerHTML = VIEWS.map((v, i) =>
    `<button id="nav-${i}" class="${i === activeView ? 'active' : ''}" onclick="setView(${i})">${v}</button>`
  ).join("");
}

function setView(idx) {
  activeView = idx;
  VIEWS.forEach((_, i) => {
    const b = document.getElementById("nav-" + i);
    if (b) b.className = (i === activeView) ? "active" : "";
  });
  renderCurrentView(window.latestState || window.simEngine.state);
}

function updateTopBar(st) {
  document.getElementById("tb-time").textContent = st.sim_time.toFixed(1);
  const pAvg = st.tanks.reduce((a, t) => a + t.p_dome, 0) * 0.25;
  document.getElementById("tb-pdome").textContent = pAvg.toFixed(2);
  document.getElementById("tb-mefuel").textContent = st.me_fuel_kgs.toFixed(2);
  const esdEl = document.getElementById("tb-esd");
  esdEl.textContent = st.esd1 ? ("ESD-1: " + st.esd_reason) : "ESD-1: NORMAL";
  esdEl.className = "badge " + (st.esd1 ? "esd-trip" : "esd-ok");
  const bTag = document.getElementById("backend-tag");
  bTag.textContent = window.useBackend ? "C++20 SERVER" : "JS STANDALONE";
  bTag.style.color = window.useBackend ? "#00e676" : "#00d4ff";
}

function renderTankView(st, idx) {
  const t = st.tanks[idx];
  const fillH = Math.max(0, Math.min(100, t.fill)) * 1.9;
  const liqY = 230 - fillH;
  const p1Col = t.p1_amps > 10 ? "#00e676" : "#4a607a";
  const p2Col = t.p2_amps > 10 ? "#00e676" : "#4a607a";
  const spCol = t.sp_amps > 5 ? "#00d4ff" : "#4a607a";
  const marvCol = t.p_dome >= 25.0 ? "#ff3d57" : "#4a607a";
  const isCol = t.is_ch4 > 5.0 ? "#ff3d57" : "#1e3a5f";
  const sprayOp = (t.spray_v || 0) > 1 ? 0.75 : 0.0;

  return `<div class="grid-2">
    <div class="card">
      <h3>CT${t.id} GTT MARK III FLEX MEMBRANE MIMIC (NO CENTER BHD)</h3>
      <svg viewBox="0 0 420 260">
        <defs>
          <clipPath id="octClip">
            <polygon points="105,40 315,40 360,80 360,200 320,230 100,230 60,200 60,80"/>
          </clipPath>
        </defs>
        <!-- Secondary & Primary Insulation Space Outline (IBS / IS) -->
        <polygon points="97,32 323,32 370,76 370,205 326,238 94,238 50,205 50,76"
                 fill="none" stroke="${isCol}" stroke-width="4" stroke-dasharray="6,3"/>
        <!-- Liquid LNG Pool Clipped to Octagonal Membrane -->
        <g clip-path="url(#octClip)">
          <rect x="50" y="${liqY}" width="320" height="${fillH + 10}" fill="#0088cc" fill-opacity="0.55"/>
          <line x1="50" y1="${liqY}" x2="370" y2="${liqY}" stroke="#00d4ff" stroke-width="2"/>
          <!-- Sloshing Barred Zone Band (10% to 70%) -->
          <line x1="60" y1="97" x2="360" y2="97" stroke="#ffab00" stroke-width="1" stroke-dasharray="4,4"/>
          <line x1="60" y1="211" x2="360" y2="211" stroke="#ffab00" stroke-width="1" stroke-dasharray="4,4"/>
        </g>
        <!-- Primary Corrugated Membrane Wall -->
        <polygon points="105,40 315,40 360,80 360,200 320,230 100,230 60,200 60,80"
                 fill="none" stroke="#00d4ff" stroke-width="2.5"/>
        <!-- Top Spray Cooling Rings -->
        <g stroke="#00d4ff" stroke-width="1.5" opacity="${sprayOp}">
          <line x1="130" y1="45" x2="115" y2="85" stroke-dasharray="3,3"/>
          <line x1="150" y1="45" x2="165" y2="85" stroke-dasharray="3,3"/>
          <line x1="270" y1="45" x2="255" y2="85" stroke-dasharray="3,3"/>
          <line x1="290" y1="45" x2="305" y2="85" stroke-dasharray="3,3"/>
        </g>
        <!-- Central Stainless Steel Pump Tower -->
        <line x1="204" y1="28" x2="204" y2="225" stroke="#8aa4c4" stroke-width="2.5"/>
        <line x1="216" y1="28" x2="216" y2="225" stroke="#8aa4c4" stroke-width="2.5"/>
        <!-- Submerged Cargo Pumps P1, P2 & Spray Pump SP -->
        <circle cx="184" cy="218" r="9" fill="${p1Col}" stroke="#fff" stroke-width="1.2"/>
        <circle cx="236" cy="218" r="9" fill="${p2Col}" stroke="#fff" stroke-width="1.2"/>
        <circle cx="210" cy="222" r="6" fill="${spCol}" stroke="#fff" stroke-width="1"/>
        <!-- Dome & MARVS Riser -->
        <rect x="195" y="16" width="30" height="14" fill="#132238" stroke="#00d4ff" stroke-width="1.5"/>
        <circle cx="265" cy="22" r="7" fill="${marvCol}" stroke="#fff" stroke-width="1"/>
      </svg>
    </div>
    <div class="card">
      <h3>CT${t.id} TELEMETRY &amp; CONTROLS</h3>
      <div class="kv"><span>Fill Level / Volume:</span><span>${t.fill.toFixed(2)} % (${t.vol.toFixed(0)} m&sup3;)</span></div>
      <div class="kv"><span>Cargo Mass:</span><span>${t.mass.toFixed(1)} MT</span></div>
      <div class="kv"><span>Dome Pressure (MARVS 25 kPaG):</span><span>${t.p_dome.toFixed(2)} kPaG</span></div>
      <div class="kv"><span>Liquid / Vapor Temp:</span><span>${t.t_liq.toFixed(1)} &deg;C / ${t.t_vap.toFixed(1)} &deg;C</span></div>
      <div class="kv"><span>Membrane Temp / Cool Rate:</span><span>${t.t_mem.toFixed(1)} &deg;C (${t.cool_rate.toFixed(1)} &deg;C/h)</span></div>
      <div class="kv"><span>Boil-Off Rate (BOR):</span><span>${t.bor_kgs.toFixed(3)} kg/s</span></div>
      <div class="kv"><span>Primary / Secondary N2 (IS/IBS):</span><span>${t.p_is.toFixed(2)} / ${t.p_ibs.toFixed(2)} kPaG (CH4: ${t.is_ch4.toFixed(1)}%)</span></div>
      <div class="kv"><span>Sloshing Status (10-70% Zone):</span><span class="${t.slosh ? 'warn-text' : 'ok-text'}">${t.slosh ? 'SLOSHING RESONANCE ZONE' : 'SAFE'}</span></div>
      <div class="ctrl-row">
        <span>Liquid Fill Valve (${(t.fill_v || 0).toFixed(0)}%):</span>
        <input type="range" min="0" max="100" value="${t.fill_v || 0}" oninput="sendCmd('tank=${idx}&fill_v='+this.value)">
      </div>
      <div class="ctrl-row">
        <span>Top Spray Valve (${(t.spray_v || 0).toFixed(0)}%):</span>
        <input type="range" min="0" max="100" value="${t.spray_v || 0}" oninput="sendCmd('tank=${idx}&spray_v='+this.value)">
      </div>
      <div class="ctrl-row" style="margin-top:10px;">
        <button onclick="sendCmd('tank=${idx}&pump_tog=0')">MAIN P1 (${t.p1_amps.toFixed(0)}A)</button>
        <button onclick="sendCmd('tank=${idx}&pump_tog=1')">MAIN P2 (${t.p2_amps.toFixed(0)}A)</button>
        <button onclick="sendCmd('tank=${idx}&pump_tog=2')">SPRAY PUMP (${t.sp_amps.toFixed(0)}A)</button>
      </div>
    </div>
  </div>`;
}

function renderBogGcuView(st) {
  const c0 = st.comp[0], c2 = st.comp[2];
  const ldX = 50 + Math.min(280, (c0.qa / 5500.0) * 280);
  const ldY = 190 - Math.min(150, (c0.hp / 450.0) * 150);
  const hdX = 50 + Math.min(280, (c2.qa / 20000.0) * 280);
  const hdY = 190 - Math.min(150, (c2.hp / 180.0) * 150);

  const compCards = st.comp.map((c, i) => {
    const label = i < 2 ? `LD COMP #${i + 1} (FUEL GAS)` : `HD COMP #${i - 1} (SHORE RETURN)`;
    return `<div class="card">
      <h3>${label}</h3>
      <div class="kv"><span>Status / Mode:</span><span class="${c.run ? 'ok-text' : ''}">${c.run ? 'RUNNING' : 'STOPPED'}</span></div>
      <div class="kv"><span>Polytropic Head (Hp):</span><span>${c.hp.toFixed(1)} kJ/kg</span></div>
      <div class="kv"><span>Suction Flow / Surge Line:</span><span>${c.qa.toFixed(0)} / ${c.q_surge.toFixed(0)} m&sup3;/h</span></div>
      <div class="kv"><span>IGV Opening / ASV Recycle:</span><span>${c.igv.toFixed(1)}% / ${c.asv.toFixed(1)}%</span></div>
      <div class="kv"><span>Net Mass Flow / Power:</span><span>${c.kgs.toFixed(2)} kg/s (${c.kw.toFixed(0)} kW)</span></div>
      <div class="kv"><span>Discharge Temp:</span><span>${c.t_dis.toFixed(1)} &deg;C</span></div>
      <div class="ctrl-row">
        <button onclick="sendCmd('comp_tog=${i}')">${c.run ? 'STOP' : 'START'}</button>
        <input type="range" min="15" max="100" value="${c.igv}" oninput="sendCmd('comp=${i}&igv='+this.value)">
      </div>
    </div>`;
  }).join("");

  return `<div class="grid-2" style="margin-bottom:10px;">
    <div class="card">
      <h3>CENTRIFUGAL COMPRESSOR 2D MAP (Hp vs Qa &amp; SURGE LINE)</h3>
      <svg viewBox="0 0 380 220">
        <line x1="50" y1="25" x2="50" y2="190" stroke="#4a607a" stroke-width="1.5"/>
        <line x1="50" y1="190" x2="350" y2="190" stroke="#4a607a" stroke-width="1.5"/>
        <!-- Surge Limit Line -->
        <line x1="95" y1="185" x2="175" y2="35" stroke="#ff3d57" stroke-width="2" stroke-dasharray="5,4"/>
        <text x="180" y="45" fill="#ff3d57" font-size="10">SURGE LIMIT LINE</text>
        <!-- Characteristic IGV Curves -->
        <path d="M 110 55 Q 230 65 320 185" fill="none" stroke="#1e3a5f" stroke-width="2"/>
        <path d="M 98 95 Q 195 105 265 185" fill="none" stroke="#1e3a5f" stroke-width="1.5"/>
        <!-- Live Operating Points -->
        <circle cx="${ldX}" cy="${ldY}" r="6" fill="#00e676" stroke="#fff"/>
        <text x="${ldX + 8}" y="${ldY + 3}" fill="#00e676" font-size="10">LD1</text>
        <circle cx="${hdX}" cy="${hdY}" r="6" fill="#00d4ff" stroke="#fff"/>
        <text x="${hdX + 8}" y="${hdY + 3}" fill="#00d4ff" font-size="10">HD1</text>
        <text x="155" y="210" fill="#7b93b2" font-size="10">Volumetric Flow Qa (m3/h)</text>
      </svg>
    </div>
    <div class="card">
      <h3>GCU, MAIN ENGINE FUEL &amp; STEAM VAPORIZERS</h3>
      <div class="kv"><span>GCU Feed Valve / Burn Flow:</span><span>${st.gcu.valve.toFixed(1)}% (${st.gcu.burn_kgs.toFixed(2)} kg/s)</span></div>
      <div class="kv"><span>GCU Thermal Load / Flue Temp:</span><span>${st.gcu.mw.toFixed(1)} MW / ${st.gcu.temp_c.toFixed(0)} &deg;C</span></div>
      <div class="kv"><span>Main Vaporizer (Vacuum Makeup):</span><span>${st.vap.main_en ? 'ONLINE' : 'OFF'} (${st.vap.main_kgs.toFixed(2)} kg/s)</span></div>
      <div class="kv"><span>Forcing Vaporizer (Fuel Boost):</span><span>${st.vap.force_en ? 'ONLINE' : 'OFF'} (${st.vap.force_kgs.toFixed(2)} kg/s)</span></div>
      <div class="ctrl-row">
        <span>ME Fuel Demand (${st.me_fuel_kgs.toFixed(2)} kg/s):</span>
        <input type="range" min="0" max="2.2" step="0.05" value="${st.me_fuel_kgs}" oninput="sendCmd('me_fuel='+this.value)">
      </div>
      <div class="ctrl-row">
        <span>HD Desuperheater Spray (${st.vap.desup_v.toFixed(0)}%):</span>
        <input type="range" min="0" max="100" value="${st.vap.desup_v}" oninput="sendCmd('desup='+this.value)">
      </div>
      <div class="ctrl-row" style="margin-top:8px;">
        <button onclick="sendCmd('vap_main=1')">TOGGLE MAIN VAPORIZER</button>
        <button onclick="sendCmd('vap_force=1')">TOGGLE FORCING VAPORIZER</button>
      </div>
    </div>
  </div>
  <div class="grid-4">${compCards}</div>`;
}

function renderManifoldView(st) {
  const m = st.manifold;
  const modes = ["0: VOYAGE / CLOSED", "1: SHORE BULK LOADING", "2: SHORE BULK DISCHARGE"];
  return `<div class="grid-2">
    <div class="card">
      <h3>LIQUID MANIFOLD &amp; SHORE VAPOR RETURN</h3>
      <div class="kv"><span>Active Manifold Mode:</span><span class="ok-text">${modes[m.mode]}</span></div>
      <div class="kv"><span>Liquid Header Pressure:</span><span>${m.p_liq.toFixed(1)} kPaG</span></div>
      <div class="kv"><span>Stripping / Spray Header:</span><span>${m.p_strip.toFixed(1)} kPaG</span></div>
      <div class="kv"><span>Net Shore Liquid Transfer:</span><span>${m.shore_liq_kgs.toFixed(1)} kg/s</span></div>
      <div class="kv"><span>Shore Vapor Return Pressure:</span><span>${m.p_vap_ret.toFixed(1)} kPaG</span></div>
      <div class="kv"><span>Shore Vapor Return Flow (HD):</span><span>${m.shore_vap_kgs.toFixed(2)} kg/s</span></div>
      <div class="kv"><span>Desuperheated Vapor Return Temp:</span><span class="${m.t_vap_ret > -120 ? 'alm-text' : 'ok-text'}">${m.t_vap_ret.toFixed(1)} &deg;C (Limit -120 &deg;C)</span></div>
      <div class="kv"><span>30s SIGTTO ESD Liquid / Vapor Valves:</span><span>${m.esd_liq_v.toFixed(0)}% / ${m.esd_vap_v.toFixed(0)}%</span></div>
      <div class="ctrl-row" style="margin-top:10px;">
        <button onclick="sendCmd('op_mode=0')">VOYAGE CLOSED</button>
        <button onclick="sendCmd('op_mode=1')">SHORE LOAD</button>
        <button onclick="sendCmd('op_mode=2')">SHORE DISCHARGE</button>
      </div>
    </div>
    <div class="card">
      <h3>SHORE BOUNDARY &amp; DESUPERHEATER NOTES</h3>
      <p style="color:var(--muted);line-height:1.5;">
        During Bulk Loading (Mode 1), displaced vapor and flash gas are drawn by HD Compressors #1/#2 and pushed to the Shore Vapor Return manifold. Keep the Inline Desuperheater spray above 25% so return gas stays colder than -120 &deg;C, otherwise the terminal trips ESD-1.
      </p>
    </div>
  </div>`;
}

function renderWbtView(st) {
  const wbt = st.wbt_fill || [15,15,15,15,15,15,15,15,20,35];
  const rows = WBT_GEOM.map((g, i) =>
    `<div class="kv"><span>${g.name} (${g.maxVol} m&sup3;):</span><span>${wbt[i].toFixed(1)} % (${(g.maxVol * wbt[i] * 0.01025).toFixed(0)} MT)</span></div>`
  ).join("");
  return `<div class="card"><h3>DOUBLE-HULL U-SHAPED WATER BALLAST TANKS (10 TANKS)</h3>${rows}</div>`;
}

function renderFgdEsdView(st) {
  return `<div class="grid-2">
    <div class="card">
      <h3>SIGTTO ESD-1 INTERLOCK &amp; GAS DETECTION</h3>
      <div class="kv"><span>ESD-1 System Status:</span><span class="${st.esd1 ? 'alm-text' : 'ok-text'}">${st.esd1 ? 'TRIPPED (' + st.esd_reason + ')' : 'ARMED &amp; NORMAL'}</span></div>
      <div class="kv"><span>Compressor Motor Room +dP:</span><span>65.0 Pa (Min 25 Pa)</span></div>
      <div class="kv"><span>Dome Fusible Plug Loop (104 &deg;C):</span><span>${(st.fire_temp || 32.0).toFixed(1)} &deg;C</span></div>
      <div class="kv"><span>Very Low Tank Pressure Trip:</span><span>&le; 1.50 kPaG</span></div>
      <div class="kv"><span>High-High Overfill Protection:</span><span>&gt; 98.50 %</span></div>
      <div class="ctrl-row" style="margin-top:10px;">
        <button class="btn-danger" onclick="sendCmd('esd=1')">MANUAL ESD-1</button>
        <button class="btn-danger" onclick="sendCmd('fire_sim=1')">SIMULATE 104&deg;C FIRE PLUG</button>
        <button class="btn-ok" onclick="sendCmd('esd=0')">RESET ESD</button>
      </div>
    </div>
    <div class="card">
      <h3>BARRIER GAS DETECTION (% VOL CH4 IN IS SPACE)</h3>
      ${st.tanks.map(t => `<div class="kv"><span>CT${t.id} Primary Insulation Space (IS):</span><span class="${t.is_ch4 > 10 ? 'alm-text' : 'ok-text'}">${t.is_ch4.toFixed(1)} % Vol CH4</span></div>`).join("")}
    </div>
  </div>`;
}

function renderLoadView(st) {
  const h = st.hydro;
  return `<div class="grid-2">
    <div class="card">
      <h3>20-STATION BONJEAN HYDROSTATICS &amp; LONGITUDINAL STRESS</h3>
      <div class="kv"><span>Displacement:</span><span>${h.disp.toFixed(0)} MT</span></div>
      <div class="kv"><span>Drafts (Fwd / Mid / Aft):</span><span>${h.df.toFixed(2)} m / ${h.dm.toFixed(2)} m / ${h.da.toFixed(2)} m</span></div>
      <div class="kv"><span>Trim / Heel Angle:</span><span>${h.trim.toFixed(2)} m / ${h.heel.toFixed(2)} &deg;</span></div>
      <div class="kv"><span>Fluid GM0 / Free Surface Corr (FSC):</span><span>${h.gm.toFixed(2)} m (FSC: ${h.fsc.toFixed(2)} m)</span></div>
      <div class="kv"><span>Max SWSF (Limit 16,500 MT):</span><span class="${h.swsf > 16500 ? 'alm-text' : 'ok-text'}">${h.swsf.toFixed(0)} MT</span></div>
      <div class="kv"><span>Max SWBM (Limit 380,000 MT&middot;m):</span><span class="${h.swbm > 380000 ? 'alm-text' : 'ok-text'}">${h.swbm.toFixed(0)} MT&middot;m</span></div>
    </div>
    <div class="card">
      <h3>MEMBRANE SLOSHING RESONANCE MONITOR (10% - 70% BARRED)</h3>
      ${st.tanks.map(t => `<div class="kv"><span>CT${t.id} Fill (${t.fill.toFixed(1)}%):</span><span class="${t.slosh ? 'warn-text' : 'ok-text'}">${t.slosh ? 'BARRED SLOSHING ZONE' : 'APPROVED'}</span></div>`).join("")}
    </div>
  </div>`;
}

function renderBarrierView(st) {
  return `<div class="grid-4">${st.tanks.map((t, i) => `<div class="card">
    <h3>CT${t.id} N2 BARRIER SPACES</h3>
    <div class="kv"><span>Primary Space (IS):</span><span>${t.p_is.toFixed(2)} kPaG</span></div>
    <div class="kv"><span>Secondary Space (IBS):</span><span>${t.p_ibs.toFixed(2)} kPaG</span></div>
    <div class="kv"><span>IS Methane Sweep:</span><span class="${t.is_ch4 > 5 ? 'alm-text' : 'ok-text'}">${t.is_ch4.toFixed(1)} % Vol</span></div>
    <div class="ctrl-row"><button onclick="sendCmd('tank=${i}&leak_tog=1')">SIMULATE MEMBRANE LEAK</button></div>
  </div>`).join("")}</div>`;
}

function renderPresetsView(st) {
  const names = [
    "0: Laden Voyage (94% LNG, LD1 Auto Fuel Gas)",
    "1: Shore Bulk Loading (HD1+HD2 to Shore Vapor Return)",
    "2: Shore Bulk Discharge (8 Main Pumps + Main Vaporizer)",
    "3: Ballast Spray Cool-Down (Top Spray Rings Active)",
    "4: Ballast Voyage (3.5% Heel Retention)",
    "5: Idle Anchorage (Zero ME Demand, GCU Auto Burn)",
    "6: CT2 Primary Membrane Leak Emergency Drill",
    "7: Drydock N2 Inerting / Gassing-Up"
  ];
  return `<div class="card"><h3>OPERATIONAL SCENARIO PRESETS</h3><div class="grid-2">${names.map((n, i) =>
    `<button class="${st.preset === i ? 'active' : ''}" style="padding:12px;text-align:left;" onclick="sendCmd('preset=${i}')">${n}</button>`
  ).join("")}</div></div>`;
}

function renderOpsDataView(st) {
  return `<div class="grid-4">${st.tanks.map(t => `<div class="card">
    <h3>CT${t.id} OPS TELEMETRY</h3>
    <ul style="list-style:disc;padding-left:18px;line-height:1.65;">
      <li>Dome Press: <b>${t.p_dome.toFixed(2)} kPaG</b></li>
      <li>Liq / Vap Temp: <b>${t.t_liq.toFixed(1)} / ${t.t_vap.toFixed(1)} &deg;C</b></li>
      <li>Membrane Temp: <b>${t.t_mem.toFixed(1)} &deg;C</b></li>
      <li>Cool Rate: <b>${t.cool_rate.toFixed(1)} &deg;C/h</b></li>
      <li>Fill / Vol: <b>${t.fill.toFixed(2)}% (${t.vol.toFixed(0)} m&sup3;)</b></li>
      <li>Cargo Mass: <b>${t.mass.toFixed(1)} MT</b></li>
      <li>BOR: <b>${t.bor_kgs.toFixed(3)} kg/s</b></li>
      <li>IS / IBS N2: <b>${t.p_is.toFixed(2)} / ${t.p_ibs.toFixed(2)} kPaG</b></li>
    </ul>
  </div>`).join("")}</div>`;
}

function renderCurrentView(st) {
  updateTopBar(st);
  const vp = document.getElementById("viewport");
  if (activeView === 0) {
    if (!document.getElementById("webgl-hull")) vp.innerHTML = render3DHullView(st);
    draw3DHullFrame(st);
  }
  else if (activeView <= 4) vp.innerHTML = renderTankView(st, activeView - 1);
  else if (activeView === 5) vp.innerHTML = renderBogGcuView(st);
  else if (activeView === 6) vp.innerHTML = renderManifoldView(st);
  else if (activeView === 7) vp.innerHTML = renderWbtView(st);
  else if (activeView === 8) vp.innerHTML = renderFgdEsdView(st);
  else if (activeView === 9) vp.innerHTML = renderLoadView(st);
  else if (activeView === 10) vp.innerHTML = renderBarrierView(st);
  else if (activeView === 11) vp.innerHTML = renderPresetsView(st);
  else vp.innerHTML = renderOpsDataView(st);
}

initNav();
setInterval(() => {
  fetch("/state").then(r => r.json()).then(d => {
    window.useBackend = true;
    window.latestState = Object.assign(window.simEngine.state, d);
    renderCurrentView(window.latestState);
  }).catch(() => {
    window.useBackend = false;
    window.simEngine.step(0.5);
    renderCurrentView(window.simEngine.state);
  });
}, 500);
