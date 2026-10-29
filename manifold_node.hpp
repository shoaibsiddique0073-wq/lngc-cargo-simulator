#pragma once
#include <cmath>
#include <algorithm>

struct ManifoldSystem {
    // Op modes: 0=CLOSED/VOYAGE, 1=LOADING FROM SHORE, 2=DISCHARGING TO SHORE
    int op_mode = 0;
    double shore_liq_p_kpag = 420.0;
    double shore_liq_t_c = -161.3;
    double shore_vap_backp_kpag = 18.0; // Terminal vapor return backpressure

    double esd_liq_valve_pct = 100.0;
    double esd_vap_valve_pct = 100.0;
    double p_liq_hdr_kpag = 15.0;
    double p_strip_hdr_kpag = 280.0;
    double p_vap_return_kpag = 18.0;
    double t_vap_return_c = -138.0;
    double net_shore_liq_kgs = 0.0;
    double net_shore_vap_kgs = 0.0;
    bool shore_vap_temp_trip = false; // Terminal trips if return vapor > -120 degC

    void step(double dt, double total_pump_kgs, double total_strip_kgs,
              double total_hd_kgs, double t_hd_desup_c,
              double sum_fill_valve_pct, bool esd_active) {
        // SIGTTO 30-second linear ESD valve closure ramp (3.33% per second)
        if (esd_active) {
            esd_liq_valve_pct = std::max(0.0, esd_liq_valve_pct - 3.34 * dt);
            esd_vap_valve_pct = std::max(0.0, esd_vap_valve_pct - 3.34 * dt);
        } else {
            esd_liq_valve_pct = std::min(100.0, esd_liq_valve_pct + 10.0 * dt);
            esd_vap_valve_pct = std::min(100.0, esd_vap_valve_pct + 10.0 * dt);
        }

        double cv_liq = esd_liq_valve_pct / 100.0;
        double cv_vap = esd_vap_valve_pct / 100.0;

        // Liquid Header Hydraulic Balance
        if (op_mode == 1 && cv_liq > 0.01) {
            // Shore Loading: up to ~ 10,000 m3/h (~ 1,175 kg/s)
            double fill_cond = std::clamp(sum_fill_valve_pct / 320.0, 0.0, 1.25);
            net_shore_liq_kgs = 1175.0 * cv_liq * fill_cond *
                                std::sqrt(std::max(0.0, shore_liq_p_kpag - 25.0) / 400.0);
            p_liq_hdr_kpag = shore_liq_p_kpag - 0.00012 * net_shore_liq_kgs * net_shore_liq_kgs;
        } else if (op_mode == 2 && cv_liq > 0.01) {
            // Discharging to Shore
            net_shore_liq_kgs = -total_pump_kgs * cv_liq;
            p_liq_hdr_kpag = 160.0 + 0.00028 * total_pump_kgs * total_pump_kgs / std::max(0.05, cv_liq);
        } else {
            net_shore_liq_kgs = 0.0;
            p_liq_hdr_kpag = (total_pump_kgs > 1.0) ? 580.0 : 25.0;
        }

        // Stripping / Spray Header Pressure
        p_strip_hdr_kpag = (total_strip_kgs > 0.05) ? 390.0 : 45.0;

        // Shore Vapor Return Network & Desuperheater Temperature Check
        t_vap_return_c = t_hd_desup_c;
        if (total_hd_kgs > 0.1 && t_vap_return_c > -120.0) {
            shore_vap_temp_trip = true; // Terminal rejects warm vapor > -120 degC
        } else if (t_vap_return_c <= -122.0) {
            shore_vap_temp_trip = false;
        }

        if (cv_vap > 0.01 && !shore_vap_temp_trip) {
            net_shore_vap_kgs = total_hd_kgs * cv_vap;
            p_vap_return_kpag = shore_vap_backp_kpag + 0.18 * total_hd_kgs * total_hd_kgs / cv_vap;
        } else {
            net_shore_vap_kgs = 0.0;
            p_vap_return_kpag = 115.0; // Deadheaded HD discharge
        }
    }
};
