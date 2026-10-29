// LNGC Membrane Simulator - Serverless Fallback & C++20 Sync Engine (7-Bit ASCII)
const P_ATM = 101.325, R_UNIV = 8.314462, MW_CH4 = 16.043, MW_N2 = 28.013, TB_CH4 = -161.52;

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

function pSatCh4Kpag(tC) {
  const tK = clamp(tC + 273.15, 91.0, 190.0);
  return Math.pow(10.0, 3.9895 - 443.028 / (tK - 0.49)) * 100.0 - P_ATM;
}

function tSatCh4C(pKpag) {
  const pBar = Math.max(0.05, (pKpag + P_ATM) / 100.0);
  return (443.028 / (3.9895 - Math.log10(pBar))) + 0.49 - 273.15;
}

function rhoLiquidLng(tC) {
  return clamp(422.6 - 1.42 * (tC - TB_CH4), 380.0, 455.0);
}

function rhoVaporMix(pKpag, tC, xCh4) {
  const xm = clamp(xCh4, 0.0, 1.0);
  const mw = xm * MW_CH4 + (1.0 - xm) * MW_N2;
  const pPa = Math.max(1000.0, (pKpag + P_ATM) * 1000.0);
  const tK = Math.max(90.0, tC + 273.15);
  const pBar = pPa / 1e5;
  const z = clamp(1.0 - 0.032 * pBar * Math.pow(111.6 / tK, 1.6), 0.75, 1.0);
  return (pPa * mw * 1e-3) / (z * R_UNIV * tK);
}

function hFgCh4(pKpag) {
  return clamp(510.8 - 2.15 * (tSatCh4C(pKpag) - TB_CH4), 440.0, 535.0);
}

const CT_GEOM = [
  { id: 1, maxVol: 36500, lcg: 84.0, vcg: 16.8, h: 33.5, area: 6200, maxIt: 58000 },
  { id: 2, maxVol: 45800, lcg: 31.0, vcg: 16.5, h: 33.5, area: 7400, maxIt: 86000 },
  { id: 3, maxVol: 45800, lcg: -24.0, vcg: 16.5, h: 33.5, area: 7400, maxIt: 86000 },
  { id: 4, maxVol: 45900, lcg: -79.0, vcg: 16.6, h: 33.5, area: 7450, maxIt: 86000 }
];

const WBT_GEOM = [
  { name: "WBT 1P", maxVol: 5400, lcg: 82.0, vcg: 8.5, tcg: -14.2, maxIt: 4200 },
  { name: "WBT 1S", maxVol: 5400, lcg: 82.0, vcg: 8.5, tcg: 14.2, maxIt: 4200 },
  { name: "WBT 2P", maxVol: 7200, lcg: 30.0, vcg: 7.8, tcg: -16.8, maxIt: 5600 },
  { name: "WBT 2S", maxVol: 7200, lcg: 30.0, vcg: 7.8, tcg: 16.8, maxIt: 5600 },
  { name: "WBT 3P", maxVol: 7200, lcg: -25.0, vcg: 7.8, tcg: -16.8, maxIt: 5600 },
  { name: "WBT 3S", maxVol: 7200, lcg: -25.0, vcg: 7.8, tcg: 16.8, maxIt: 5600 },
  { name: "WBT 4P", maxVol: 6800, lcg: -78.0, vcg: 8.2, tcg: -15.5, maxIt: 5100 },
  { name: "WBT 4S", maxVol: 6800, lcg: -78.0, vcg: 8.2, tcg: 15.5, maxIt: 5100 },
  { name: "FPK",    maxVol: 4500, lcg: 126.0, vcg: 12.0, tcg: 0.0, maxIt: 2900 },
  { name: "APT",    maxVol: 3800, lcg: -131.0, vcg: 13.5, tcg: 0.0, maxIt: 3100 }
];

class StandaloneLNGCSim {
  constructor() {
    this.state = {
      sim_time: 0.0, preset: 0, esd1: false, esd_reason: "NORMAL", me_fuel_kgs: 0.95,
      hydro: { disp: 112000, df: 11.4, dm: 11.5, da: 11.6, trim: -0.2, gm: 4.8, fsc: 1.1, heel: 0.0, swsf: 4200, swbm: 125000, stress_alm: false },
      manifold: { mode: 0, p_liq: 25.0, p_strip: 280.0, p_vap_ret: 18.0, t_vap_ret: -138.0, esd_liq_v: 100.0, esd_vap_v: 100.0, shore_liq_kgs: 0.0, shore_vap_kgs: 0.0, temp_trip: false },
      gcu: { valve: 0.0, burn_kgs: 0.0, mw: 0.0, temp_c: 45.0 },
      vap: { main_en: false, main_kgs: 0.0, main_t: -135.0, force_en: false, force_kgs: 0.0, desup_v: 35.0 },
      comp: [
        { run: true, hd: false, igv: 72.0, asv: 0.0, hp: 310.0, qa: 3200.0, q_surge: 1900.0, kgs: 1.10, t_dis: -32.0, kw: 450.0, surge: false },
        { run: false, hd: false, igv: 70.0, asv: 0.0, hp: 0.0, qa: 0.0, q_surge: 1850.0, kgs: 0.0, t_dis: -90.0, kw: 0.0, surge: false },
        { run: false, hd: true, igv: 85.0, asv: 0.0, hp: 0.0, qa: 0.0, q_surge: 7900.0, kgs: 0.0, t_dis: -105.0, kw: 0.0, surge: false },
        { run: false, hd: true, igv: 85.0, asv: 0.0, hp: 0.0, qa: 0.0, q_surge: 7900.0, kgs: 0.0, t_dis: -105.0, kw: 0.0, surge: false }
      ],
      tanks: [0, 1, 2, 3].map(i => ({
        id: i + 1, fill: 94.0, vol: CT_GEOM[i].maxVol * 0.94, mass: CT_GEOM[i].maxVol * 0.94 * 0.422,
        p_dome: 11.5, t_liq: -161.2, t_vap: -148.0, t_mem: -160.5, cool_rate: 0.0, bor_kgs: 0.24,
        p_is: 0.45, p_ibs: 0.60, is_ch4: 0.0, slosh: false, p1_amps: 0.0, p2_amps: 0.0, sp_amps: 0.0,
        p1_run: false, p2_run: false, sp_run: false, fill_v: 0.0, spray_v: 0.0, leak: false, x_ch4: 0.998
      })),
      wbt_fill: [15, 15, 15, 15, 15, 15, 15, 15, 20, 35],
      wbt_mode: 0, bpump: [false, false], motor_dp: 65.0, fire_temp: 32.0
    };
    this.loadPreset(0);
  }

  loadPreset(p) {
    const s = this.state;
    s.preset = p; s.esd1 = false; s.esd_reason = "NORMAL"; s.fire_temp = 32.0; s.motor_dp = 65.0;
    s.manifold.mode = (p === 1) ? 1 : (p === 2 ? 2 : 0);
    s.me_fuel_kgs = (p === 1) ? 0.15 : (p === 5 ? 0.0 : 0.95);
    s.comp[0].run = true; s.comp[0].igv = 72.0; s.comp[1].run = false;
    s.comp[2].run = (p === 1); s.comp[3].run = (p === 1);
    s.vap.main_en = (p === 2); s.vap.force_en = false;
    s.tanks.forEach((t, i) => {
      t.fill = (p === 3 || p === 4 || p === 7) ? 3.5 : 94.0;
      t.t_liq = -161.2; t.t_vap = (p === 3) ? -85.0 : -148.0; t.t_mem = t.t_vap;
      t.p_dome = (p === 5) ? 16.2 : 11.5; t.x_ch4 = (p === 7) ? 0.05 : 0.998;
      t.fill_v = (p === 1) ? 85.0 : 0.0; t.spray_v = (p === 3) ? 65.0 : 0.0;
      t.p1_run = (p === 2); t.p2_run = (p === 2);
      t.sp_run = (p === 1 || p === 2 || p === 3 || p === 4);
      t.leak = (p === 6 && i === 1); t.is_ch4 = 0.0; t.p_is = 0.45; t.p_ibs = 0.60;
      t.vol = CT_GEOM[i].maxVol * (t.fill / 100.0);
      t.mass = t.vol * rhoLiquidLng(t.t_liq) / 1000.0;
    });
  }

  step(dt) {
    const s = this.state;
    s.sim_time += dt;
    let pHdr = 0, tHdr = 0, xHdr = 0, sumFillV = 0;
    s.tanks.forEach(t => { pHdr += t.p_dome * 0.25; tHdr += t.t_vap * 0.25; xHdr += t.x_ch4 * 0.25; sumFillV += (t.fill_v || 0); });

    s.comp.forEach((c, idx) => {
      if (s.esd1 || pHdr <= 1.2) c.run = false;
      if (!c.run) { c.hp = c.qa = c.kgs = c.kw = 0; c.surge = false; return; }
      if (!c.hd) c.igv = clamp(c.igv + (pHdr - 11.5) * 4.0 * dt, 15.0, 100.0);
      const p1 = Math.max(90.0, pHdr + P_ATM), p2 = (c.hd ? s.manifold.p_vap_ret : 650.0) + P_ATM;
      const t1K = Math.max(100.0, tHdr + 273.15), rp = Math.max(1.05, p2 / p1);
      c.hp = 0.92 * (R_UNIV / 16.2) * t1K * (1.38 / 0.38) * (Math.pow(rp, 0.38 / 1.38) - 1.0);
      const igv = clamp(c.igv / 100.0, 0.15, 1.0), qMax = c.hd ? 18500.0 : 4800.0;
      const hpMax = (c.hd ? 145.0 : 420.0) * (0.55 + 0.45 * igv);
      c.q_surge = qMax * (0.28 + 0.18 * igv);
      const qMap = qMax * igv * Math.sqrt(Math.max(0.0, 1.10 - clamp(c.hp / hpMax, 0.0, 1.08)));
      const margin = (qMap - c.q_surge) / c.q_surge;
      c.asv = clamp(c.asv + (margin < 0.12 ? (0.12 - margin) * 45.0 : -8.0) * dt, 0.0, 100.0);
      const qAsv = (c.asv / 100.0) * c.q_surge * 0.95;
      c.qa = qMap + qAsv; c.surge = c.qa < c.q_surge;
      const rhoS = rhoVaporMix(pHdr, tHdr, xHdr);
      c.kgs = Math.max(0.0, ((c.qa - qAsv) * rhoS) / 3600.0);
      c.t_dis = t1K * Math.pow(rp, 0.38 / 1.38) - 273.15;
      c.kw = (((c.qa * rhoS) / 3600.0) * c.hp) / 0.78;
    });

    const ldKgs = s.comp[0].kgs + s.comp[1].kgs, hdKgs = s.comp[2].kgs + s.comp[3].kgs;
    s.vap.main_kgs = (s.vap.main_en && !s.esd1) ? 3.8 : 0.0;
    s.vap.force_kgs = (s.vap.force_en && !s.esd1) ? 1.5 : 0.0;
    const desupDrop = (s.vap.desup_v / 100.0) * 42.0;
    s.manifold.t_vap_ret = (hdKgs > 0.05 ? ((s.comp[2].t_dis + s.comp[3].t_dis) * 0.5 - desupDrop) : -138.0);
    s.manifold.temp_trip = (hdKgs > 0.1 && s.manifold.t_vap_ret > -120.0);

    const excessBog = Math.max(0.0, ldKgs + s.vap.force_kgs - s.me_fuel_kgs);
    s.gcu.valve = s.esd1 ? 0.0 : clamp(s.gcu.valve + (pHdr - 14.5) * 12.0 * dt, 0.0, 100.0);
    s.gcu.burn_kgs = s.esd1 ? 0.0 : Math.max(excessBog, 1.35 * (s.gcu.valve / 100.0));
    s.gcu.mw = s.gcu.burn_kgs * 50.0; s.gcu.temp_c = 65.0 + 280.0 * s.gcu.burn_kgs;

    s.manifold.esd_liq_v = clamp(s.manifold.esd_liq_v + (s.esd1 ? -3.34 : 10.0) * dt, 0.0, 100.0);
    s.manifold.esd_vap_v = clamp(s.manifold.esd_vap_v + (s.esd1 ? -3.34 : 10.0) * dt, 0.0, 100.0);
    const cvL = s.manifold.esd_liq_v / 100.0, cvV = s.manifold.esd_vap_v / 100.0;

    let totPumpKgs = 0;
    s.tanks.forEach((t, i) => {
      if (s.esd1) { t.p1_run = false; t.p2_run = false; t.sp_run = false; }
      t.p1_amps = t.p1_run ? 610.0 : 0.0; t.p2_amps = t.p2_run ? 610.0 : 0.0; t.sp_amps = t.sp_run ? 38.0 : 0.0;
      const pOutKgs = (t.p1_run ? 192.0 : 0.0) + (t.p2_run ? 192.0 : 0.0);
      totPumpKgs += pOutKgs;
      const qPumpKw = (t.p1_run ? 225.0 : 0.0) + (t.p2_run ? 225.0 : 0.0) + (t.sp_run ? 12.0 : 0.0);
      const qHullKw = 0.145 * CT_GEOM[i].area * (0.25 + 0.75 * (t.fill / 100.0)) * (22.0 - t.t_liq) / 1000.0;
      t.bor_kgs = (qHullKw + qPumpKw) / hFgCh4(t.p_dome);
      const sprayKgs = (t.sp_run ? 1.4 * ((t.spray_v || 0) / 100.0) : 0.0);
      const prevMem = t.t_mem;
      t.t_mem += (((t.fill > 5.0 ? t.t_liq : t.t_vap - 18.0 * ((t.spray_v || 0) / 100.0)) - t.t_mem) * 0.015) * dt;
      t.cool_rate = ((t.t_mem - prevMem) / Math.max(0.01, dt)) * 3600.0;

      const liqIn = (s.manifold.mode === 1 && sumFillV > 0.1) ? (1150.0 * cvL * ((t.fill_v || 0) / sumFillV)) : 0.0;
      const netLiq = liqIn - pOutKgs * cvL - t.bor_kgs;
      const rhoL = rhoLiquidLng(t.t_liq);
      t.mass = clamp(t.mass + (netLiq * dt) / 1000.0, 0.0, CT_GEOM[i].maxVol * 0.99 * rhoL / 1000.0);
      t.vol = (t.mass * 1000.0) / rhoL; t.fill = (t.vol / CT_GEOM[i].maxVol) * 100.0;
      const vUll = Math.max(150.0, CT_GEOM[i].maxVol - t.vol);
      const vapDraw = (ldKgs + hdKgs * cvV + s.gcu.burn_kgs * 0.35) * 0.25;
      const vapRet = (s.vap.main_kgs + s.vap.force_kgs) * 0.25;
      const netVap = t.bor_kgs + vapRet + (netLiq / rhoL) * 1.8 - sprayKgs * 0.65 - vapDraw;
      t.p_dome = clamp(t.p_dome + (netVap * dt / vUll) * 62.0, -5.0, 28.0);
      if (t.leak) { t.p_is = clamp(t.p_is + 0.35 * dt, 0.2, 6.5); t.is_ch4 = clamp(t.is_ch4 + 2.4 * dt, 0.0, 85.0); }
      else { t.p_is = 0.45; t.is_ch4 = Math.max(0.0, t.is_ch4 - 1.5 * dt); }
      t.slosh = (t.fill >= 10.0 && t.fill <= 70.0);
      if (!s.esd1 && (t.fill > 98.5 || t.p_dome <= 1.5 || t.is_ch4 > 30.0)) {
        s.esd1 = true; s.esd_reason = "CT" + t.id + (t.fill > 98.5 ? " OVERFILL" : (t.p_dome <= 1.5 ? " LOW PRESS" : " BARRIER LEAK"));
      }
    });
    s.manifold.shore_liq_kgs = (s.manifold.mode === 1) ? 1150.0 * cvL : (s.manifold.mode === 2 ? -totPumpKgs * cvL : 0.0);
    s.manifold.shore_vap_kgs = hdKgs * cvV;
    if (!s.esd1 && (s.manifold.temp_trip || s.fire_temp >= 104.0)) {
      s.esd1 = true; s.esd_reason = s.fire_temp >= 104.0 ? "FIRE LOOP > 104C" : "SHORE VAPOR TEMP > -120C";
    }
  }
}

window.simEngine = new StandaloneLNGCSim();
window.useBackend = false;

function sendCmd(q) {
  const s = window.simEngine.state, p = new URLSearchParams(q);
  if (p.has("preset")) window.simEngine.loadPreset(parseInt(p.get("preset")));
  if (p.has("esd")) { s.esd1 = p.get("esd") === "1"; if (s.esd1) s.esd_reason = "MANUAL CCR PUSHBUTTON"; else { s.esd_reason = "NORMAL"; s.fire_temp = 32.0; } }
  if (p.has("op_mode")) s.manifold.mode = parseInt(p.get("op_mode"));
  if (p.has("me_fuel")) s.me_fuel_kgs = parseFloat(p.get("me_fuel"));
  if (p.has("desup")) s.vap.desup_v = parseFloat(p.get("desup"));
  if (p.has("comp_tog")) { const c = parseInt(p.get("comp_tog")); s.comp[c].run = !s.comp[c].run; }
  if (p.has("igv")) { const c = parseInt(p.get("comp")); s.comp[c].igv = parseFloat(p.get("igv")); }
  if (p.has("vap_main")) s.vap.main_en = !s.vap.main_en;
  if (p.has("vap_force")) s.vap.force_en = !s.vap.force_en;
  if (p.has("pump_tog")) {
    const t = s.tanks[parseInt(p.get("tank"))], pk = parseInt(p.get("pump_tog"));
    if (pk === 0) t.p1_run = !t.p1_run; else if (pk === 1) t.p2_run = !t.p2_run; else t.sp_run = !t.sp_run;
  }
  if (p.has("fill_v")) s.tanks[parseInt(p.get("tank"))].fill_v = parseFloat(p.get("fill_v"));
  if (p.has("spray_v")) s.tanks[parseInt(p.get("tank"))].spray_v = parseFloat(p.get("spray_v"));
  if (p.has("leak_tog")) { const t = s.tanks[parseInt(p.get("tank"))]; t.leak = !t.leak; }
  if (p.has("fire_sim")) s.fire_temp = 112.0;
  fetch("/cmd?" + q).catch(() => {});
}
