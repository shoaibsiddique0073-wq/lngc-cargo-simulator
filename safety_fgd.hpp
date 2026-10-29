#pragma once
#include "tank_node.hpp"
#include <array>
#include <string>

struct SafetyFGDSystem {
    // 8 Zones: 0=COMP RM, 1=MOTOR RM, 2=GCU RM, 3=MANIFOLD, 4..7=IS BARRIER 1..4
    std::array<double, 8> ch4_lel_pct = {0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0};
    double motor_room_dp_pa = 65.0; // Positive pressure airlock (> 50 Pa required)
    double fusible_plug_temp_c = 32.0; // Melts at 104 degC

    bool esd1_active = false;
    bool esd2_active = false;
    std::string esd_reason = "NORMAL";

    void trigger_manual_esd(const std::string& src) {
        esd1_active = true;
        esd_reason = src;
    }

    void reset_esd() {
        esd1_active = false;
        esd2_active = false;
        esd_reason = "NORMAL";
        fusible_plug_temp_c = 32.0;
    }

    void step(const std::array<MembraneTankNode, 4>& tanks, bool shore_vap_trip) {
        for (int i = 0; i < 4; ++i) {
            // Convert Vol% CH4 in IS barrier to equivalent % LEL display (5% Vol = 100% LEL)
            ch4_lel_pct[4 + i] = std::min(100.0, tanks[i].is_ch4_pct_vol * 20.0);

            if (!esd1_active && tanks[i].fill_pct > 98.5) {
                esd1_active = true;
                esd_reason = "CT" + std::to_string(i + 1) + " OVERFILL > 98.5%";
            }
            if (!esd1_active && tanks[i].p_dome_kpag <= 1.5) {
                esd1_active = true;
                esd_reason = "CT" + std::to_string(i + 1) + " VERY LOW PRESS <= 1.5 kPaG";
            }
            if (!esd1_active && tanks[i].is_ch4_pct_vol > 30.0) {
                esd1_active = true;
                esd_reason = "CT" + std::to_string(i + 1) + " PRIMARY BARRIER LEAK";
            }
        }
        if (!esd1_active && fusible_plug_temp_c >= 104.0) {
            esd1_active = true;
            esd_reason = "FIRE LOOP FUSIBLE PLUG > 104C";
        }
        if (!esd1_active && motor_room_dp_pa < 25.0) {
            esd1_active = true;
            esd_reason = "COMP MOTOR ROOM LOSS OF +dP";
        }
        if (!esd1_active && shore_vap_trip) {
            esd1_active = true;
            esd_reason = "SHORE VAPOR RETURN HIGH TEMP > -120C";
        }
    }
};
