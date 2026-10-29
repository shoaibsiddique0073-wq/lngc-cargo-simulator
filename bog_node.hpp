#pragma once
#include "fluid_props.hpp"
#include <cmath>
#include <algorithm>

struct CentrifugalComp {
    bool running = false;
    bool is_hd = false;         // false = LD (Fuel Gas), true = HD (Shore Return)
    double igv_pct = 75.0;      // Inlet Guide Vane 15-100%
    double asv_pct = 0.0;       // Anti-Surge Valve 0-100%
    double head_poly_kjkg = 0.0;// Polytropic head (kJ/kg)
    double vol_flow_m3h = 0.0;  // Actual inlet volumetric flow Q_a
    double surge_flow_m3h = 0.0;
    double net_mass_kgs = 0.0;  // Forward flow extracted from vapor header
    double recycle_kgs = 0.0;   // Recycled flow through ASV
    double dis_temp_c = -90.0;
    double power_kw = 0.0;
    bool in_surge_alarm = false;

    void step(double p_suc_kpag, double t_suc_c, double p_dis_kpag,
              double x_ch4, bool esd_active, double dt) {
        if (esd_active || p_suc_kpag <= 1.2) {
            running = false; // Low suction pressure / ESD trip
        }
        if (!running) {
            head_poly_kjkg = vol_flow_m3h = net_mass_kgs = recycle_kgs = power_kw = 0.0;
            in_surge_alarm = false;
            return;
        }
        double p1 = std::max(90.0, p_suc_kpag + FluidProps::P_ATM_KPA);
        double p2 = std::max(p1 + 5.0, p_dis_kpag + FluidProps::P_ATM_KPA);
        double t1_k = std::max(100.0, t_suc_c + 273.15);
        double mw = x_ch4 * FluidProps::MW_CH4 + (1.0 - x_ch4) * FluidProps::MW_N2;
        double z = FluidProps::z_factor(p_suc_kpag, t_suc_c);
        constexpr double n_poly = 1.38; // Polytropic exponent for cryogenic CH4
        double r_spec = FluidProps::R_UNIV / mw; // kJ/(kg*K)

        // Polytropic Head: Hp = Z * R_spec * T1 * (n/(n-1)) * ((P2/P1)^((n-1)/n) - 1)
        double rp = p2 / p1;
        head_poly_kjkg = z * r_spec * t1_k * (n_poly / (n_poly - 1.0)) *
                         (std::pow(rp, (n_poly - 1.0) / n_poly) - 1.0);

        // 2D Centrifugal Map: max head & flow scaled by IGV opening
        double igv = std::clamp(igv_pct / 100.0, 0.15, 1.0);
        double q_rated = is_hd ? 18500.0 : 4800.0;  // m3/h actual suction flow
        double hp_shutoff = (is_hd ? 145.0 : 420.0) * (0.55 + 0.45 * igv);
        surge_flow_m3h = q_rated * (0.28 + 0.18 * igv);

        double head_ratio = std::clamp(head_poly_kjkg / hp_shutoff, 0.0, 1.08);
        double q_map = q_rated * igv * std::sqrt(std::max(0.0, 1.10 - head_ratio));

        // Automatic Anti-Surge PID Controller
        double surge_margin = (q_map - surge_flow_m3h) / std::max(1.0, surge_flow_m3h);
        if (surge_margin < 0.12) {
            asv_pct = std::clamp(asv_pct + (0.12 - surge_margin) * 45.0 * dt, 0.0, 100.0);
        } else {
            asv_pct = std::clamp(asv_pct - 8.0 * dt, 0.0, 100.0);
        }

        double q_asv = (asv_pct / 100.0) * surge_flow_m3h * 0.95;
        vol_flow_m3h = q_map + q_asv;
        in_surge_alarm = (vol_flow_m3h < surge_flow_m3h);

        double rho_suc = FluidProps::rho_vapor_mix(p_suc_kpag, t_suc_c, x_ch4);
        double total_kgs = (vol_flow_m3h * rho_suc) / 3600.0;
        recycle_kgs = (q_asv * rho_suc) / 3600.0;
        net_mass_kgs = std::max(0.0, total_kgs - recycle_kgs);

        double t2_k = t1_k * std::pow(rp, (n_poly - 1.0) / n_poly);
        dis_temp_c = t2_k - 273.15;
        power_kw = (total_kgs * head_poly_kjkg) / 0.78; // 78% polytropic efficiency
    }
};

struct GasCombustionUnit {
    bool enabled = true;
    bool auto_mode = true;
    double valve_pct = 0.0;
    double burn_flow_kgs = 0.0; // Max ~ 1.35 kg/s (~ 4.86 t/h)
    double exhaust_temp_c = 45.0;
    double thermal_mw = 0.0;

    void step(double p_vap_hdr_kpag, double excess_ld_kgs, bool esd_active, double dt) {
        if (esd_active || !enabled) {
            valve_pct = burn_flow_kgs = thermal_mw = 0.0;
            exhaust_temp_c = 45.0;
            return;
        }
        if (auto_mode) {
            // Cascade PID opens GCU when tank/header pressure exceeds 14.5 kPaG
            double err = p_vap_hdr_kpag - 14.5;
            valve_pct = std::clamp(valve_pct + err * 12.0 * dt, 0.0, 100.0);
        }
        double cap_kgs = 1.35 * (valve_pct / 100.0) *
                         std::sqrt(std::max(0.0, p_vap_hdr_kpag) / 15.0);
        burn_flow_kgs = std::max(excess_ld_kgs, cap_kgs);
        thermal_mw = (burn_flow_kgs * 50000.0) / 1000.0; // LHV CH4 = 50 MJ/kg
        exhaust_temp_c = 65.0 + 380.0 * (burn_flow_kgs / 1.35);
    }
};
