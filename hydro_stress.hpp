#pragma once
#include "ship_tables.hpp"
#include <cmath>
#include <algorithm>

struct HydroState {
    double disp_mt = 0.0;
    double draft_f = 0.0, draft_m = 0.0, draft_a = 0.0, trim_m = 0.0;
    double kmt_m = 21.8, kg_solid_m = 16.0, fsc_m = 0.0, gm_fluid_m = 5.8;
    double heel_deg = 0.0;
    double max_swsf_mt = 0.0;   // Limit: 16,500 MT
    double max_swbm_mtm = 0.0;  // Limit: 380,000 MT*m
    bool sloshing_alarm[4] = {false, false, false, false};
    bool stress_alarm = false;
};

namespace HydroSolver {
    inline HydroState solve(
        const std::array<double, 4>& ct_mass_mt,
        const std::array<double, 4>& ct_fill_pct,
        const std::array<double, 4>& ct_rho_kgm3,
        const std::array<double, 10>& wbt_mass_mt,
        const std::array<double, 10>& wbt_fill_pct
    ) {
        using namespace ShipTables;
        HydroState st;
        double total_m = LIGHTSHIP_MT;
        double mom_l = LIGHTSHIP_MT * LIGHTSHIP_LCG;
        double mom_v = LIGHTSHIP_MT * LIGHTSHIP_VCG;
        double mom_t = 0.0;
        double fsc_mom_tm = 0.0;

        for (int i = 0; i < 4; ++i) {
            double m = ct_mass_mt[i];
            double f = ct_fill_pct[i] / 100.0;
            total_m += m;
            mom_l += m * CT_GEOM[i].lcg_m;
            double vcg = 2.8 + CT_GEOM[i].height_m * (0.15 + 0.38 * f);
            mom_v += m * vcg;
            // Membrane tanks have huge free surface when between 2% and 96%
            if (ct_fill_pct[i] > 1.5 && ct_fill_pct[i] < 97.5) {
                double taper = std::sin(std::clamp(f, 0.05, 0.95) * 3.14159265);
                fsc_mom_tm += CT_GEOM[i].max_it_m4 * taper * (ct_rho_kgm3[i] / 1000.0);
            }
            st.sloshing_alarm[i] = (ct_fill_pct[i] >= 10.0 && ct_fill_pct[i] <= 70.0);
        }

        for (int i = 0; i < 10; ++i) {
            double m = wbt_mass_mt[i];
            double f = wbt_fill_pct[i] / 100.0;
            total_m += m;
            mom_l += m * WBT_GEOM[i].lcg_m;
            mom_v += m * (1.5 + WBT_GEOM[i].vcg_full_m * f);
            mom_t += m * WBT_GEOM[i].tcg_m;
            if (wbt_fill_pct[i] > 2.0 && wbt_fill_pct[i] < 98.0) {
                fsc_mom_tm += WBT_GEOM[i].max_it_m4 * RHO_SW;
            }
        }

        st.disp_mt = total_m;
        double lcg = mom_l / total_m;
        st.kg_solid_m = mom_v / total_m;
        st.fsc_m = fsc_mom_tm / total_m;

        // Mean draft & Trim via waterplane & MCT
        st.draft_m = 2.65 + (total_m / (LBP * BEAM * 0.94 * RHO_SW));
        double lcb = -1.65 - 0.08 * (st.draft_m - 11.5);
        double mct_1m = 1480.0 * (st.draft_m / 11.5);
        st.trim_m = (total_m * (lcg - lcb)) / (mct_1m * 100.0);
        st.draft_f = st.draft_m + 0.5 * st.trim_m;
        st.draft_a = st.draft_m - 0.5 * st.trim_m;

        st.kmt_m = 23.4 - 0.19 * st.draft_m + 0.008 * st.draft_m * st.draft_m;
        st.gm_fluid_m = std::max(0.25, st.kmt_m - st.kg_solid_m - st.fsc_m);
        double tcg = mom_t / total_m;
        st.heel_deg = std::atan2(tcg, st.gm_fluid_m) * (180.0 / 3.14159265);

        // 20-station shear force and bending moment integration
        double sf = 0.0, bm = 0.0, dx = LBP / 20.0;
        for (int s = 0; s < 20; ++s) {
            double x = -0.5 * LBP + (s + 0.5) * dx;
            double b_st = (total_m / 20.0) * BONJEAN_WEIGHTS[s];
            double w_st = (LIGHTSHIP_MT / 20.0);
            for (int c = 0; c < 4; ++c)
                if (std::abs(x - CT_GEOM[c].lcg_m) < 28.0) w_st += ct_mass_mt[c] / 4.0;
            for (int w = 0; w < 10; ++w)
                if (std::abs(x - WBT_GEOM[w].lcg_m) < 28.0) w_st += wbt_mass_mt[w] / 4.0;
            sf += (b_st - w_st);
            bm += sf * dx * 0.16;
            st.max_swsf_mt = std::max(st.max_swsf_mt, std::abs(sf));
            st.max_swbm_mtm = std::max(st.max_swbm_mtm, std::abs(bm));
        }
        st.stress_alarm = (st.max_swsf_mt > 16500.0 || st.max_swbm_mtm > 380000.0);
        return st;
    }
}
