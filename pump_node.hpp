#pragma once
#include "fluid_props.hpp"
#include <cmath>
#include <algorithm>

struct SubmergedPump {
    bool running = false;
    double throttle_pct = 80.0; // Discharge valve 0-100%
    double flow_m3h = 0.0;
    double mass_flow_kgs = 0.0;
    double amps = 0.0;
    double power_kw = 0.0;
    double heat_to_lng_kw = 0.0; // Direct thermal rejection into LNG pool
    double npsh_a_m = 10.0;
    double npsh_r_m = 1.2;
    int trip_code = 0; // 0=OK, 1=DRY-RUN(<42A), 2=OVERLOAD(>240A), 3=CAVITATION, 4=ESD

    void step(double p_dome_kpag, double t_liq_c, double liq_level_m,
              double p_hdr_kpag, bool is_spray_pump, bool esd_active) {
        if (esd_active && running) {
            running = false;
            trip_code = 4;
        }
        double rho_l = FluidProps::rho_liquid_lng(t_liq_c);
        double p_sat = FluidProps::p_sat_ch4_kpag(t_liq_c);
        // NPSHa = (P_dome - P_sat)/(rho*g) + liquid head above pump suction bell
        double bell_clearance = is_spray_pump ? 0.04 : 0.22;
        double eff_head_m = std::max(0.0, liq_level_m - bell_clearance);
        npsh_a_m = ((p_dome_kpag - p_sat) * 1000.0) / (rho_l * 9.81) + eff_head_m;

        double th = std::clamp(throttle_pct / 100.0, 0.0, 1.0);
        npsh_r_m = is_spray_pump ? (0.15 + 0.35 * th * th) : (0.65 + 1.45 * th * th);

        if (!running) {
            flow_m3h = 0.0;
            mass_flow_kgs = 0.0;
            amps = 0.0;
            power_kw = 0.0;
            heat_to_lng_kw = 0.0;
            return;
        }

        // Centrifugal pump shutoff head ~ 155 m LNG (~ 640 kPaG)
        double max_q = is_spray_pump ? 65.0 : 1650.0;
        double p_shutoff_kpag = p_dome_kpag + (is_spray_pump ? 580.0 : 650.0);
        double dp_avail = std::max(0.0, p_shutoff_kpag - p_hdr_kpag);
        double q_raw = max_q * th * std::sqrt(std::clamp(dp_avail / 550.0, 0.0, 1.2));

        // Cavitation degradation & trip check
        if (npsh_a_m < npsh_r_m) {
            q_raw *= std::clamp(npsh_a_m / std::max(0.1, npsh_r_m), 0.0, 1.0);
            if (npsh_a_m < 0.75 * npsh_r_m) {
                running = false;
                trip_code = 3;
            }
        }

        flow_m3h = q_raw;
        mass_flow_kgs = (flow_m3h * rho_l) / 3600.0;

        // Electrical draw & submerged motor thermal dissipation into cargo
        double rated_kw = is_spray_pump ? 28.0 : 540.0;
        power_kw = rated_kw * (0.28 + 0.72 * (flow_m3h / max_q));
        if (liq_level_m < bell_clearance) power_kw *= 0.22; // Unloaded dry spin
        amps = (power_kw * 1000.0) / (1.732 * 440.0 * 0.86);

        // All shaft & motor inefficiency + fluid friction inside tank becomes heat in LNG
        heat_to_lng_kw = power_kw * 0.42;

        if (!is_spray_pump && amps < 42.0) {
            running = false;
            trip_code = 1; // Low-amp dry run protection
        } else if (!is_spray_pump && amps > 820.0) {
            running = false;
            trip_code = 2; // Overload trip
        }
    }
};
