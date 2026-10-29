#include "lngc_engine.hpp"
#include <iostream>
#include <fstream>
#include <thread>
#include <mutex>
#include <atomic>
#include <cstring>
#include <cstdlib>
#include <unistd.h>
#include <netinet/in.h>
#include <sys/socket.h>

LNGCEngine g_engine;
std::mutex g_mtx;
std::atomic<bool> g_running{true};

double get_param(const std::string& req, const std::string& key, double def_val) {
    auto pos = req.find(key + "=");
    if (pos == std::string::npos) return def_val;
    return std::atof(req.c_str() + pos + key.size() + 1);
}

std::string read_file(const std::string& path, const std::string& fallback) {
    std::ifstream f(path, std::ios::binary);
    if (!f) return fallback;
    return std::string((std::istreambuf_iterator<char>(f)), std::istreambuf_iterator<char>());
}

void apply_cmd(const std::string& req) {
    std::lock_guard<std::mutex> lk(g_mtx);
    if (req.find("preset=") != std::string::npos)
        g_engine.load_preset((int)get_param(req, "preset", 0));
    if (req.find("esd=1") != std::string::npos)
        g_engine.safety.trigger_manual_esd("MANUAL CCR PUSHBUTTON");
    if (req.find("esd=0") != std::string::npos)
        g_engine.safety.reset_esd();
    if (req.find("op_mode=") != std::string::npos)
        g_engine.manifold.op_mode = (int)get_param(req, "op_mode", 0);
    if (req.find("me_fuel=") != std::string::npos)
        g_engine.me_fuel_demand_kgs = get_param(req, "me_fuel", 0.95);
    if (req.find("desup=") != std::string::npos)
        g_engine.vap.desup_spray_valve_pct = get_param(req, "desup", 35.0);
    if (req.find("vap_main=") != std::string::npos)
        g_engine.vap.main_vap_enabled = !g_engine.vap.main_vap_enabled;
    if (req.find("vap_force=") != std::string::npos)
        g_engine.vap.force_vap_enabled = !g_engine.vap.force_vap_enabled;
    if (req.find("fire_sim=") != std::string::npos)
        g_engine.safety.fusible_plug_temp_c = 112.0;
    if (req.find("comp_tog=") != std::string::npos) {
        int c = (int)get_param(req, "comp_tog", 0);
        if (c >= 0 && c < 2) g_engine.ld_comp[c].running = !g_engine.ld_comp[c].running;
        else if (c >= 2 && c < 4) g_engine.hd_comp[c - 2].running = !g_engine.hd_comp[c - 2].running;
    }
    if (req.find("igv=") != std::string::npos) {
        int c = (int)get_param(req, "comp", 0);
        double v = get_param(req, "igv", 75.0);
        if (c >= 0 && c < 2) g_engine.ld_comp[c].igv_pct = v;
        else if (c >= 2 && c < 4) g_engine.hd_comp[c - 2].igv_pct = v;
    }
    int t = (int)get_param(req, "tank", -1);
    if (t >= 0 && t < 4) {
        if (req.find("pump_tog=") != std::string::npos) {
            int p = (int)get_param(req, "pump_tog", 0);
            if (p == 0 || p == 1) g_engine.tanks[t].main_pumps[p].running = !g_engine.tanks[t].main_pumps[p].running;
            else if (p == 2) g_engine.tanks[t].spray_pump.running = !g_engine.tanks[t].spray_pump.running;
        }
        if (req.find("fill_v=") != std::string::npos)
            g_engine.tanks[t].liq_fill_valve_pct = get_param(req, "fill_v", 0.0);
        if (req.find("spray_v=") != std::string::npos)
            g_engine.tanks[t].spray_valve_pct = get_param(req, "spray_v", 0.0);
        if (req.find("leak_tog=") != std::string::npos)
            g_engine.tanks[t].barrier_leak_sim = !g_engine.tanks[t].barrier_leak_sim;
    }
}

int main() {
    std::thread phys_thread([]() {
        while (g_running) {
            std::this_thread::sleep_for(std::chrono::milliseconds(500));
            std::lock_guard<std::mutex> lk(g_mtx);
            g_engine.step(0.5);
        }
    });

    int srv_fd = socket(AF_INET, SOCK_STREAM, 0);
    int opt = 1;
    setsockopt(srv_fd, SOL_SOCKET, SO_REUSEADDR, &opt, sizeof(opt));
    sockaddr_in addr{};
    addr.sin_family = AF_INET;
    addr.sin_addr.s_addr = htonl(INADDR_LOOPBACK);
    addr.sin_port = htons(8080);

    if (bind(srv_fd, (struct sockaddr*)&addr, sizeof(addr)) < 0 || listen(srv_fd, 16) < 0) {
        std::cerr << "Failed to bind 127.0.0.1:8080\n";
        g_running = false;
        phys_thread.join();
        return 1;
    }
    std::cout << "LNGC Membrane Simulator C++20 Engine online at http://127.0.0.1:8080\n";

    while (g_running) {
        int cli = accept(srv_fd, nullptr, nullptr);
        if (cli < 0) continue;
        char buf[2048] = {0};
        ssize_t n = read(cli, buf, sizeof(buf) - 1);
        std::string req(buf, n > 0 ? n : 0);

        std::string body, ctype = "application/json";
        if (req.find("GET /cmd?") != std::string::npos) {
            apply_cmd(req);
            std::lock_guard<std::mutex> lk(g_mtx);
            body = g_engine.to_json();
        } else if (req.find("GET /state") != std::string::npos) {
            std::lock_guard<std::mutex> lk(g_mtx);
            body = g_engine.to_json();
        } else if (req.find("GET /standalone_sim.js") != std::string::npos) {
            ctype = "application/javascript";
            body = read_file("standalone_sim.js", "// missing standalone_sim.js");
        } else if (req.find("GET /ui_3d.js") != std::string::npos) {
            ctype = "application/javascript";
            body = read_file("ui_3d.js", "// missing ui_3d.js");
        } else if (req.find("GET /ui_mimics.js") != std::string::npos) {
            ctype = "application/javascript";
            body = read_file("ui_mimics.js", "// missing ui_mimics.js");
        } else {
            ctype = "text/html";
            body = read_file("index.html", "<h1>Missing index.html</h1>");
        }
        std::string resp = "HTTP/1.1 200 OK\r\nContent-Type: " + ctype +
                           "\r\nCache-Control: no-store\r\nAccess-Control-Allow-Origin: *\r\nContent-Length: " +
                           std::to_string(body.size()) + "\r\nConnection: close\r\n\r\n" + body;
        write(cli, resp.c_str(), resp.size());
        close(cli);
    }
    g_running = false;
    phys_thread.join();
    return 0;
}
