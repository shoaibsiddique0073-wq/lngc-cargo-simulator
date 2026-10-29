#pragma once
#include "fluid_props.hpp"
#include <cmath>
#include <algorithm>

struct VaporizerSystem {
    // 1. Main LNG Vaporizer (feeds tank vapor header during discharge)
    bool main_vap_enabled = false;
    double main_lng_valve_pct = 0.0;
    double main_steam_valve_pct = 50.0;
    double main_vap_flow_kgs = 0.0;
    double main_out_temp_c = -135.0;
    double main_steam_kgs = 0.0;
    bool main_low_temp_trip = false;

    // 2. Forcing Vaporizer (supplements LD compressor suction for main engines)
    bool force_vap_enabled = false;
    double force_lng_valve_pct = 0.0;
    double force_steam_valve_pct = 50.0;
    double force_vap_flow_kgs = 0.0;
    double force_out_temp_c = -40.0;
    double force_steam_kgs = 0.0;

    // 3. Inline Desuperheater for HD Shore Return
    double desup_spray_valve_pct = 35.0;
    double desup_spray_kgs = 0.0;

    void step(double p_strip_hdr_kpag, double t_lng_c, double p_vap_hdr_kpag, bool esd) {
        if (esd) {
            main_vap_enabled = false;
            force_vap_enabled = false;
        }
        double dp_avail = std::max(0.0, p_strip_hdr_kpag - p_vap_hdr_kpag);
        double h_in = FluidProps::h_liquid_lng(t_lng_c);
        constexpr double H_FG_STEAM = 2100.0; // kJ/kg low-pressure steam

        // Main Vaporizer (max ~ 5.5 kg/s ~ 20,000 kg/h vapor makeup)
        if (main_vap_enabled && !main_low_temp_trip && dp_avail > 15.0) {
            main_vap_flow_kgs = 5.5 * (main_lng_valve_pct / 100.0) * std::sqrt(dp_avail / 350.0);
            main_steam_kgs = 3.2 * (main_steam_valve_pct / 100.0);
            double q_steam_kw = main_steam_kgs * H_FG_STEAM;
            if (main_vap_flow_kgs > 0.05) {
                double h_out = h_in + (q_steam_kw / main_vap_flow_kgs);
                double h_sat_v = FluidProps::h_vapor_ch4(p_vap_hdr_kpag, FluidProps::t_sat_ch4_c(p_vap_hdr_kpag));
                main_out_temp_c = std::clamp(-158.0 + (h_out - h_sat_v) / 2.15, -161.0, 40.0);
                if (main_out_temp_c < -152.0) {
                    main_low_temp_trip = true;
                    main_vap_enabled = false;
                }
            }
        } else {
            main_vap_flow_kgs = 0.0;
            main_steam_kgs = 0.0;
        }

        // Forcing Vaporizer (max ~ 2.2 kg/s ~ 8,000 kg/h fuel gas boost)
        if (force_vap_enabled && dp_avail > 15.0) {
            force_vap_flow_kgs = 2.2 * (force_lng_valve_pct / 100.0) * std::sqrt(dp_avail / 350.0);
            force_steam_kgs = 1.6 * (force_steam_valve_pct / 100.0);
            double q_steam_kw = force_steam_kgs * H_FG_STEAM;
            if (force_vap_flow_kgs > 0.02) {
                double h_out = h_in + (q_steam_kw / force_vap_flow_kgs);
                double h_sat_v = FluidProps::h_vapor_ch4(p_vap_hdr_kpag, FluidProps::t_sat_ch4_c(p_vap_hdr_kpag));
                force_out_temp_c = std::clamp(-158.0 + (h_out - h_sat_v) / 2.15, -155.0, 45.0);
            }
        } else {
            force_vap_flow_kgs = 0.0;
            force_steam_kgs = 0.0;
        }
    }

    // Desuperheats hot HD compressor discharge before Shore Vapor Return
    double apply_hd_desuperheater(double hd_mass_kgs, double hd_dis_temp_c,
                                  double p_strip_kpag, double t_lng_c) {
        if (hd_mass_kgs < 0.05 || p_strip_kpag < 120.0) {
            desup_spray_kgs = 0.0;
            return hd_dis_temp_c;
        }
        desup_spray_kgs = 0.85 * (desup_spray_valve_pct / 100.0);
        double q_cool_kw = desup_spray_kgs * FluidProps::h_fg_ch4(20.0);
        double dt_drop = q_cool_kw / (hd_mass_kgs * 2.15);
        return std::max(t_lng_c + 5.0, hd_dis_temp_c - dt_drop);
    }
};
