#pragma once
#include <cmath>
#include <algorithm>

namespace FluidProps {
    constexpr double P_ATM_KPA = 101.325;
    constexpr double R_UNIV = 8.314462; // J/(mol*K)
    constexpr double MW_CH4 = 16.043;   // g/mol
    constexpr double MW_N2  = 28.013;   // g/mol
    constexpr double TB_CH4_C = -161.52;

    // Antoine Equation for Cryogenic Methane: P_sat in kPaA from Temp in degC
    inline double p_sat_ch4_kpaa(double t_c) {
        double t_k = std::clamp(t_c + 273.15, 91.0, 190.0);
        // NIST cryogenic fit (bar): log10(P_bar) = A - B / (T_K + C)
        constexpr double A = 3.9895, B = 443.028, C = -0.49;
        double p_bar = std::pow(10.0, A - B / (t_k + C));
        return p_bar * 100.0;
    }

    inline double p_sat_ch4_kpag(double t_c) {
        return p_sat_ch4_kpaa(t_c) - P_ATM_KPA;
    }

    // Exact inverse saturation temperature in degC from gauge pressure (kPaG)
    inline double t_sat_ch4_c(double p_kpag) {
        double p_bar = std::max(0.05, (p_kpag + P_ATM_KPA) / 100.0);
        constexpr double A = 3.9895, B = 443.028, C = -0.49;
        double t_k = (B / (A - std::log10(p_bar))) - C;
        return t_k - 273.15;
    }

    // Saturated LNG liquid density (kg/m3) around -165 to -150 degC
    inline double rho_liquid_lng(double t_c) {
        double dt = t_c - TB_CH4_C;
        return std::clamp(422.6 - 1.42 * dt, 380.0, 455.0);
    }

    // Real-gas compressibility factor Z for cryogenic Methane/N2 vapor
    inline double z_factor(double p_kpag, double t_c) {
        double p_bar = std::max(0.1, (p_kpag + P_ATM_KPA) / 100.0);
        double t_k = std::max(100.0, t_c + 273.15);
        double z = 1.0 - 0.032 * p_bar * std::pow(111.6 / t_k, 1.6);
        return std::clamp(z, 0.75, 1.0);
    }

    // Real-gas vapor mixture density (kg/m3) given mole fractions
    inline double rho_vapor_mix(double p_kpag, double t_c, double x_ch4) {
        double x_m = std::clamp(x_ch4, 0.0, 1.0);
        double mw_mix = x_m * MW_CH4 + (1.0 - x_m) * MW_N2; // g/mol
        double p_pa = std::max(1000.0, (p_kpag + P_ATM_KPA) * 1000.0);
        double t_k = std::max(90.0, t_c + 273.15);
        double z = z_factor(p_kpag, t_c);
        return (p_pa * (mw_mix * 1e-3)) / (z * R_UNIV * t_k);
    }

    // Latent heat of vaporization h_fg (kJ/kg)
    inline double h_fg_ch4(double p_kpag) {
        double t_sat = t_sat_ch4_c(p_kpag);
        return std::clamp(510.8 - 2.15 * (t_sat - TB_CH4_C), 440.0, 535.0);
    }

    // Specific enthalpy (kJ/kg), reference 0 kJ/kg at liquid -161.52 degC
    inline double h_liquid_lng(double t_c) {
        return 3.48 * (t_c - TB_CH4_C);
    }

    inline double h_vapor_ch4(double p_kpag, double t_c) {
        double t_sat = t_sat_ch4_c(p_kpag);
        return h_liquid_lng(t_sat) + h_fg_ch4(p_kpag) + 2.12 * (t_c - t_sat);
    }

    // IGC Code Max Filling Limit (%) at loading temperature vs MARVS (25 kPaG)
    inline double igc_max_fill_pct(double t_load_c) {
        double t_ref = t_sat_ch4_c(25.0); // ~ -159.0 degC at 25 kPaG MARVS
        double rho_ref = rho_liquid_lng(t_ref);
        double rho_load = rho_liquid_lng(t_load_c);
        return std::min(98.5, 98.0 * (rho_ref / rho_load));
    }
}
