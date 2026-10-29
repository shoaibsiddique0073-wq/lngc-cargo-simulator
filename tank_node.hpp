#pragma once
#include "fluid_props.hpp"
#include "ship_tables.hpp"
#include "pump_node.hpp"
#include <cmath>
#include <algorithm>

struct MembraneTankNode {
    int id = 1;
    double fill_pct = 85.0;
    double liq_vol_m3 = 31025.0;
    double liq_mass_mt = 13111.0;
    double t_liq_c = -161.2;
    double t_vap_c = -148.0;
    double t_membrane_c = -160.5;
    double cooling_rate_c_hr = 0.0;
    bool thermal_shock_alarm = false; // Trips if |dT/dt| > 10.0 degC/hr

    double p_dome_kpag = 11.5;
    double x_ch4 = 0.998; // Vapor CH4 mole fraction (remainder N2)
    double bor_kgs = 0.0; // Instantaneous Boil-Off Rate (kg/s)
    double spray_valve_pct = 0.0;
    double liq_fill_valve_pct = 0.0;
    bool marvs_lifted = false; // Lifts at 25.0 kPaG

    // Primary (IS) and Secondary (IBS) Nitrogen Insulation Barriers
    double p_is_kpag = 0.45;     // Normal 0.25 - 0.70 kPaG
    double p_ibs_kpag = 0.60;    // Normal 0.40 - 0.90 kPaG
    double is_ch4_pct_vol = 0.0; // Membrane leak indicator
    bool barrier_leak_sim = false;

    SubmergedPump main_pumps[2];
    SubmergedPump spray_pump;

    void step(double dt, double t_amb_c, double t_sw_c, double p_liq_hdr_kpag,
              double p_strip_hdr_kpag, double vap_draw_kgs, double vap_return_kgs,
              double liq_load_in_kgs, bool esd_active) {
        const auto& geom = ShipTables::CT_GEOM[id - 1];
        double rho_l = FluidProps::rho_liquid_lng(t_liq_c);
        double level_m = geom.height_m * (fill_pct / 100.0);

        for (int p = 0; p < 2; ++p)
            main_pumps[p].step(p_dome_kpag, t_liq_c, level_m, p_liq_hdr_kpag, false, esd_active);
        spray_pump.step(p_dome_kpag, t_liq_c, level_m, p_strip_hdr_kpag, true, esd_active);

        // 1. Heat Ingress through Membrane Insulation (U*A*dT calibrated to ~0.12%/day BOR)
        double t_hull_c = 0.65 * t_sw_c + 0.35 * t_amb_c;
        double u_insul_wm2k = 0.145; // W/(m2*K) Mark III Flex polyurethane foam
        double wetted_area = geom.area_wetted_base_m2 * (0.25 + 0.75 * (fill_pct / 100.0));
        double q_hull_kw = (u_insul_wm2k * wetted_area * (t_hull_c - t_liq_c)) / 1000.0;
        double q_pumps_kw = main_pumps[0].heat_to_lng_kw + main_pumps[1].heat_to_lng_kw +
                            spray_pump.heat_to_lng_kw;

        // 2. Top Spray Ring Cool-Down & Condensation
        double spray_in_kgs = 1.40 * (spray_valve_pct / 100.0) *
                              std::sqrt(std::max(0.0, p_strip_hdr_kpag - p_dome_kpag) / 300.0);
        double prev_mem_t = t_membrane_c;
        double target_mem_t = (fill_pct > 5.0) ? t_liq_c : (t_vap_c - 18.0 * (spray_valve_pct / 100.0));
        t_membrane_c += (target_mem_t - t_membrane_c) * 0.015 * dt;
        cooling_rate_c_hr = ((t_membrane_c - prev_mem_t) / std::max(0.001, dt)) * 3600.0;
        thermal_shock_alarm = (std::abs(cooling_rate_c_hr) > 10.0);

        // 3. Boil-Off & Interfacial Flash Mass Balance
        double h_fg = FluidProps::h_fg_ch4(p_dome_kpag);
        double t_sat = FluidProps::t_sat_ch4_c(p_dome_kpag);
        double superheat_flash_kw = (t_liq_c > t_sat) ? (liq_mass_mt * 3.48 * (t_liq_c - t_sat) * 0.05) : 0.0;
        double spray_cond_kgs = spray_in_kgs * std::clamp((t_vap_c - t_liq_c) / 85.0, 0.0, 0.85);
        bor_kgs = std::max(0.0, (q_hull_kw + q_pumps_kw + superheat_flash_kw) / h_fg);

        // 4. Liquid Volume & Mass Update
        double pump_out_kgs = main_pumps[0].mass_flow_kgs + main_pumps[1].mass_flow_kgs +
                              spray_pump.mass_flow_kgs;
        double net_liq_kgs = liq_load_in_kgs + (spray_in_kgs - spray_cond_kgs) - pump_out_kgs - bor_kgs;
        liq_mass_mt = std::clamp(liq_mass_mt + (net_liq_kgs * dt) / 1000.0, 0.0,
                                 (geom.max_vol_m3 * 0.99 * rho_l) / 1000.0);
        liq_vol_m3 = (liq_mass_mt * 1000.0) / rho_l;
        fill_pct = (liq_vol_m3 / geom.max_vol_m3) * 100.0;
        t_liq_c += ((t_sat - t_liq_c) * 0.008 + (q_hull_kw * 1e-6)) * dt;

        // 5. Real-Gas Ullage Pressure ODE (dP/dt)
        double v_ullage = std::max(150.0, geom.max_vol_m3 - liq_vol_m3);
        double rho_v = FluidProps::rho_vapor_mix(p_dome_kpag, t_vap_c, x_ch4);
        double m_vap_kg = v_ullage * rho_v;
        double piston_equiv_kgs = (net_liq_kgs / rho_l) * rho_v;
        double net_vap_kgs = bor_kgs + vap_return_kgs + piston_equiv_kgs - spray_cond_kgs - vap_draw_kgs;
        m_vap_kg = std::max(10.0, m_vap_kg + net_vap_kgs * dt);

        double new_rho_v = m_vap_kg / v_ullage;
        double dp_dt = ((new_rho_v - rho_v) / std::max(0.1, rho_v)) * (p_dome_kpag + FluidProps::P_ATM_KPA);
        p_dome_kpag = std::clamp(p_dome_kpag + dp_dt, -8.0, 32.0);
        if (p_dome_kpag >= 25.0) {
            marvs_lifted = true;
            p_dome_kpag -= 1.8 * dt;
        } else if (p_dome_kpag < 23.5) {
            marvs_lifted = false;
        }
        t_vap_c = std::clamp(t_vap_c + ((t_liq_c + 12.0 - t_vap_c) * 0.02 - 0.15 * spray_in_kgs) * dt,
                             -161.5, 35.0);

        // 6. Primary (IS) and Secondary (IBS) Nitrogen Barrier Spaces
        if (barrier_leak_sim) {
            p_is_kpag = std::clamp(p_is_kpag + 0.35 * dt, 0.2, 6.5);
            is_ch4_pct_vol = std::clamp(is_ch4_pct_vol + 2.4 * dt, 0.0, 85.0);
        } else {
            p_is_kpag += (0.45 - p_is_kpag) * 0.1 * dt;
            p_ibs_kpag += (0.60 - p_ibs_kpag) * 0.1 * dt;
            is_ch4_pct_vol = std::max(0.0, is_ch4_pct_vol - 1.5 * dt);
        }
    }
};
