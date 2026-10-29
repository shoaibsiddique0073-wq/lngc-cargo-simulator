#pragma once
#include <array>

namespace ShipTables {
    constexpr double LBP = 285.0;          // m
    constexpr double BEAM = 46.4;          // m
    constexpr double RHO_SW = 1.025;       // t/m3
    constexpr double LIGHTSHIP_MT = 35200.0;
    constexpr double LIGHTSHIP_LCG = -3.80; // m from midships (+fwd)
    constexpr double LIGHTSHIP_VCG = 16.40; // m above keel

    struct MembraneTankGeom {
        int id;
        double max_vol_m3;
        double lcg_m;
        double vcg_full_m;
        double height_m;
        double area_wetted_base_m2;
        double max_it_m4; // Max transverse moment of inertia (no center bhd!)
    };

    // 4 GTT Mark III Flex Membrane Tanks (Total = 174,000 m3)
    constexpr std::array<MembraneTankGeom, 4> CT_GEOM = {{
        {1, 36500.0,  84.0, 16.8, 33.5, 6200.0, 58000.0},
        {2, 45800.0,  31.0, 16.5, 33.5, 7400.0, 86000.0},
        {3, 45800.0, -24.0, 16.5, 33.5, 7400.0, 86000.0},
        {4, 45900.0, -79.0, 16.6, 33.5, 7450.0, 86000.0}
    }};

    struct BallastTankGeom {
        const char* name;
        double max_vol_m3;
        double lcg_m;
        double vcg_full_m;
        double tcg_m;
        double max_it_m4;
    };

    // 10 Double-Hull U-Shaped WBT + Forepeak & Aftpeak
    constexpr std::array<BallastTankGeom, 10> WBT_GEOM = {{
        {"WBT 1P", 5400.0,  82.0,  8.5, -14.2, 4200.0},
        {"WBT 1S", 5400.0,  82.0,  8.5,  14.2, 4200.0},
        {"WBT 2P", 7200.0,  30.0,  7.8, -16.8, 5600.0},
        {"WBT 2S", 7200.0,  30.0,  7.8,  16.8, 5600.0},
        {"WBT 3P", 7200.0, -25.0,  7.8, -16.8, 5600.0},
        {"WBT 3S", 7200.0, -25.0,  7.8,  16.8, 5600.0},
        {"WBT 4P", 6800.0, -78.0,  8.2, -15.5, 5100.0},
        {"WBT 4S", 6800.0, -78.0,  8.2,  15.5, 5100.0},
        {"FPK",    4500.0, 126.0, 12.0,   0.0, 2900.0},
        {"APT",    3800.0,-131.0, 13.5,   0.0, 3100.0}
    }};

    // 20-Station Longitudinal Distribution Weights for Buoyancy & Bending
    constexpr std::array<double, 20> BONJEAN_WEIGHTS = {
        0.25, 0.55, 0.82, 0.98, 1.08, 1.14, 1.16, 1.17, 1.18, 1.18,
        1.18, 1.18, 1.17, 1.16, 1.14, 1.08, 0.96, 0.78, 0.52, 0.32
    };
}
