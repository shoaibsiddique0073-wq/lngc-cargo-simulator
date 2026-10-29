#pragma once
#include "fluid_props.hpp"
#include "ship_tables.hpp"
#include "hydro_stress.hpp"
#include "pump_node.hpp"
#include "vaporizer_node.hpp"
#include "bog_node.hpp"
#include "tank_node.hpp"
#include "manifold_node.hpp"
#include "safety_fgd.hpp"
#include <array>
#include <sstream>
#include <iomanip>

struct LNGCEngine {
    double sim_time_s = 0.0;
    double t_amb_c = 24.0, t_sw_c = 21.0;
    double me_fuel_demand_kgs = 0.95; // X-DF / ME-GI Main Engine BOG demand (~3.4 t/h)
    int active_preset = 0;

    std::array<MembraneTankNode, 4> tanks;
    CentrifugalComp ld_comp[2];
    CentrifugalComp hd_comp[2];
    GasCombustionUnit gcu;
    VaporizerSystem vap;
    ManifoldSystem manifold;
    SafetyFGDSystem safety;
    HydroState hydro;

    // Ballast system state
    std::array<double, 10> wbt_fill_pct = {15, 15, 15, 15, 15, 15, 15, 15, 20, 35};
    std::array<double, 10> wbt_mass_mt = {};
    std::array<double, 10> wbt_valve_pct = {0, 0, 0, 0, 0, 0, 0, 0, 0, 0};
    bool bpump_run[2] = {false, false};
    int ballast_mode = 0; // 0=HOLD, 1=BALLAST IN, 2=DEBALLAST OUT, 5=GRAVITATE

    LNGCEngine() {
        for (int i = 0; i < 4; ++i) tanks[i].id = i + 1;
        ld_comp[0].is_hd = false; ld_comp[1].is_hd = false;
        hd_comp[0].is_hd = true;  hd_comp[1].is_hd = true;
        load_preset(0);
    }

    void load_preset(int p);
    void step(double dt);
    std::string to_json() const;
};

inline void LNGCEngine::load_preset(int p) {
    active_preset = p;
    safety.reset_esd();
    manifold.op_mode = 0;
    me_fuel_demand_kgs = 0.95;
    ld_comp[0].running = true; ld_comp[0].igv_pct = 72.0;
    ld_comp[1].running = false;
    hd_comp[0].running = false; hd_comp[1].running = false;
    vap.main_vap_enabled = false; vap.force_vap_enabled = false;

    for (int i = 0; i < 4; ++i) {
        tanks[i].fill_pct = (p == 3 || p == 4 || p == 7) ? 3.5 : 94.0;
        tanks[i].t_liq_c = -161.2;
        tanks[i].t_vap_c = (p == 3) ? -85.0 : -148.0;
        tanks[i].p_dome_kpag = 11.5;
        tanks[i].x_ch4 = (p == 7) ? 0.05 : 0.998;
        tanks[i].spray_valve_pct = (p == 3) ? 65.0 : 0.0;
        tanks[i].liq_fill_valve_pct = (p == 1) ? 85.0 : 0.0;
        tanks[i].barrier_leak_sim = (p == 6 && i == 1);
        const auto& g = ShipTables::CT_GEOM[i];
        tanks[i].liq_vol_m3 = g.max_vol_m3 * (tanks[i].fill_pct / 100.0);
        tanks[i].liq_mass_mt = tanks[i].liq_vol_m3 * FluidProps::rho_liquid_lng(tanks[i].t_liq_c) / 1000.0;
        tanks[i].main_pumps[0].running = (p == 2);
        tanks[i].main_pumps[1].running = (p == 2);
        tanks[i].spray_pump.running = (p == 1 || p == 3 || p == 4);
    }
    if (p == 1) { // Bulk Loading with HD Compressors to Shore Vapor Return
        manifold.op_mode = 1;
        hd_comp[0].running = true; hd_comp[0].igv_pct = 85.0;
        hd_comp[1].running = true; hd_comp[1].igv_pct = 85.0;
        me_fuel_demand_kgs = 0.15;
    } else if (p == 2) { // Bulk Discharge with Main Vaporizer Makeup
        manifold.op_mode = 2;
        vap.main_vap_enabled = true; vap.main_lng_valve_pct = 75.0;
        tanks[0].spray_pump.running = true;
    } else if (p == 5) { // Idle Anchorage: Zero ME Fuel, GCU burning 100% BOG
        me_fuel_demand_kgs = 0.0;
        tanks[0].p_dome_kpag = 16.2;
    }
    step(0.1);
}

inline void LNGCEngine::step(double dt) {
    sim_time_s += dt;
    double p_vap_hdr = 0.0, t_vap_hdr = 0.0, x_ch4_hdr = 0.0;
    double sum_fill_v = 0.0;
    for (int i = 0; i < 4; ++i) {
        p_vap_hdr += tanks[i].p_dome_kpag * 0.25;
        t_vap_hdr += tanks[i].t_vap_c * 0.25;
        x_ch4_hdr += tanks[i].x_ch4 * 0.25;
        sum_fill_v += tanks[i].liq_fill_valve_pct;
    }

    // 1. Step Compressors, Vaporizers & GCU
    for (int c = 0; c < 2; ++c) {
        // Auto-PID modulates LD IGV to hold vapor header near 11.5 kPaG
        if (ld_comp[c].running) {
            ld_comp[c].igv_pct = std::clamp(ld_comp[c].igv_pct + (p_vap_hdr - 11.5) * 4.5 * dt, 15.0, 100.0);
        }
        ld_comp[c].step(p_vap_hdr - 0.6, t_vap_hdr, 650.0, x_ch4_hdr, safety.esd1_active, dt);
        hd_comp[c].step(p_vap_hdr - 0.8, t_vap_hdr, manifold.p_vap_return_kpag, x_ch4_hdr, safety.esd1_active, dt);
    }

    double total_ld_kgs = ld_comp[0].net_mass_kgs + ld_comp[1].net_mass_kgs;
    double total_hd_kgs = hd_comp[0].net_mass_kgs + hd_comp[1].net_mass_kgs;
    double hd_t_mix = (total_hd_kgs > 0.01) ?
        (hd_comp[0].net_mass_kgs * hd_comp[0].dis_temp_c + hd_comp[1].net_mass_kgs * hd_comp[1].dis_temp_c) / total_hd_kgs : -110.0;

    vap.step(manifold.p_strip_hdr_kpag, -161.0, p_vap_hdr, safety.esd1_active);
    double t_hd_desup = vap.apply_hd_desuperheater(total_hd_kgs, hd_t_mix, manifold.p_strip_hdr_kpag, -161.0);
    double excess_ld = std::max(0.0, total_ld_kgs + vap.force_vap_flow_kgs - me_fuel_demand_kgs);
    gcu.step(p_vap_hdr, excess_ld, safety.esd1_active, dt);

    // 2. Step Tanks & Manifold
    double total_pump_kgs = 0.0, total_strip_kgs = 0.0;
    for (int i = 0; i < 4; ++i) {
        total_pump_kgs += tanks[i].main_pumps[0].mass_flow_kgs + tanks[i].main_pumps[1].mass_flow_kgs;
        total_strip_kgs += tanks[i].spray_pump.mass_flow_kgs;
    }
    manifold.step(dt, total_pump_kgs, total_strip_kgs, total_hd_kgs, t_hd_desup, sum_fill_v, safety.esd1_active);

    double vap_draw_per_tank = (total_ld_kgs + manifold.net_shore_vap_kgs + gcu.burn_flow_kgs * 0.35) * 0.25;
    double vap_ret_per_tank = (vap.main_vap_flow_kgs + vap.force_vap_flow_kgs) * 0.25;
    for (int i = 0; i < 4; ++i) {
        double liq_in = (manifold.op_mode == 1 && sum_fill_v > 0.1) ?
            manifold.net_shore_liq_kgs * (tanks[i].liq_fill_valve_pct / sum_fill_v) : 0.0;
        tanks[i].step(dt, t_amb_c, t_sw_c, manifold.p_liq_hdr_kpag, manifold.p_strip_hdr_kpag,
                      vap_draw_per_tank, vap_ret_per_tank, liq_in, safety.esd1_active);
    }

    // 3. Step Ballast, Safety & Hydrostatics
    std::array<double, 4> ct_m, ct_f, ct_rho;
    for (int i = 0; i < 4; ++i) {
        ct_m[i] = tanks[i].liq_mass_mt;
        ct_f[i] = tanks[i].fill_pct;
        ct_rho[i] = FluidProps::rho_liquid_lng(tanks[i].t_liq_c);
    }
    double bp_rate = (bpump_run[0] ? 0.85 : 0.0) + (bpump_run[1] ? 0.85 : 0.0);
    for (int w = 0; w < 10; ++w) {
        double dv = (wbt_valve_pct[w] / 100.0) * bp_rate * dt;
        if (ballast_mode == 1) wbt_fill_pct[w] = std::min(100.0, wbt_fill_pct[w] + dv * 0.02);
        else if (ballast_mode == 2) wbt_fill_pct[w] = std::max(0.0, wbt_fill_pct[w] - dv * 0.02);
        wbt_mass_mt[w] = ShipTables::WBT_GEOM[w].max_vol_m3 * (wbt_fill_pct[w] / 100.0) * ShipTables::RHO_SW;
    }
    safety.step(tanks, manifold.shore_vap_temp_trip);
    hydro = HydroSolver::solve(ct_m, ct_f, ct_rho, wbt_mass_mt, wbt_fill_pct);
}

inline std::string LNGCEngine::to_json() const {
    std::ostringstream ss;
    ss << std::fixed << std::setprecision(2);
    ss << "{\"sim_time\":" << sim_time_s
       << ",\"preset\":" << active_preset
       << ",\"esd1\":" << (safety.esd1_active ? "true" : "false")
       << ",\"esd_reason\":\"" << safety.esd_reason << "\""
       << ",\"me_fuel_kgs\":" << me_fuel_demand_kgs
       << ",\"hydro\":{\"disp\":" << hydro.disp_mt
       << ",\"df\":" << hydro.draft_f << ",\"dm\":" << hydro.draft_m << ",\"da\":" << hydro.draft_a
       << ",\"trim\":" << hydro.trim_m << ",\"gm\":" << hydro.gm_fluid_m
       << ",\"fsc\":" << hydro.fsc_m << ",\"heel\":" << hydro.heel_deg
       << ",\"swsf\":" << hydro.max_swsf_mt << ",\"swbm\":" << hydro.max_swbm_mtm
       << ",\"stress_alm\":" << (hydro.stress_alarm ? "true" : "false") << "}"
       << ",\"manifold\":{\"mode\":" << manifold.op_mode
       << ",\"p_liq\":" << manifold.p_liq_hdr_kpag << ",\"p_strip\":" << manifold.p_strip_hdr_kpag
       << ",\"p_vap_ret\":" << manifold.p_vap_return_kpag << ",\"t_vap_ret\":" << manifold.t_vap_return_c
       << ",\"esd_liq_v\":" << manifold.esd_liq_valve_pct << ",\"esd_vap_v\":" << manifold.esd_vap_valve_pct
       << ",\"shore_liq_kgs\":" << manifold.net_shore_liq_kgs
       << ",\"shore_vap_kgs\":" << manifold.net_shore_vap_kgs << "}"
       << ",\"gcu\":{\"valve\":" << gcu.valve_pct << ",\"burn_kgs\":" << gcu.burn_flow_kgs
       << ",\"mw\":" << gcu.thermal_mw << ",\"temp_c\":" << gcu.exhaust_temp_c << "}"
       << ",\"vap\":{\"main_en\":" << (vap.main_vap_enabled ? "true" : "false")
       << ",\"main_kgs\":" << vap.main_vap_flow_kgs << ",\"main_t\":" << vap.main_out_temp_c
       << ",\"force_en\":" << (vap.force_vap_enabled ? "true" : "false")
       << ",\"force_kgs\":" << vap.force_vap_flow_kgs << ",\"desup_v\":" << vap.desup_spray_valve_pct << "}"
       << ",\"comp\":[";
    for (int i = 0; i < 4; ++i) {
        const auto& c = (i < 2) ? ld_comp[i] : hd_comp[i - 2];
        if (i > 0) ss << ",";
        ss << "{\"run\":" << (c.running ? "true" : "false") << ",\"hd\":" << (c.is_hd ? "true" : "false")
           << ",\"igv\":" << c.igv_pct << ",\"asv\":" << c.asv_pct << ",\"hp\":" << c.head_poly_kjkg
           << ",\"qa\":" << c.vol_flow_m3h << ",\"q_surge\":" << c.surge_flow_m3h
           << ",\"kgs\":" << c.net_mass_kgs << ",\"t_dis\":" << c.dis_temp_c
           << ",\"kw\":" << c.power_kw << ",\"surge\":" << (c.in_surge_alarm ? "true" : "false") << "}";
    }
    ss << "],\"tanks\":[";
    for (int i = 0; i < 4; ++i) {
        const auto& t = tanks[i];
        if (i > 0) ss << ",";
        ss << "{\"id\":" << t.id << ",\"fill\":" << t.fill_pct << ",\"vol\":" << t.liq_vol_m3
           << ",\"mass\":" << t.liq_mass_mt << ",\"p_dome\":" << t.p_dome_kpag
           << ",\"t_liq\":" << t.t_liq_c << ",\"t_vap\":" << t.t_vap_c << ",\"t_mem\":" << t.t_membrane_c
           << ",\"cool_rate\":" << t.cooling_rate_c_hr << ",\"bor_kgs\":" << t.bor_kgs
           << ",\"p_is\":" << t.p_is_kpag << ",\"p_ibs\":" << t.p_ibs_kpag
           << ",\"is_ch4\":" << t.is_ch4_pct_vol << ",\"slosh\":" << (hydro.sloshing_alarm[i] ? "true" : "false")
           << ",\"p1_amps\":" << t.main_pumps[0].amps << ",\"p2_amps\":" << t.main_pumps[1].amps
           << ",\"sp_amps\":" << t.spray_pump.amps << "}";
    }
    ss << "]}";
    return ss.str();
}
