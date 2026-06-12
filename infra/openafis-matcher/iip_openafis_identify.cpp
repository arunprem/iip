/**
 * IIP OpenAFIS 1:N identify CLI — JSON stdout for ml-gateway integration.
 *
 * Usage:
 *   iip-openafis-identify --probe /path/to/probe.iso --templates /data/templates [--min-score 40]
 *
 * Templates directory contains {print_id}.iso files (ISO/IEC 19794-2:2005).
 * Output (stdout): {"matches":[{"id":"uuid","score":78},...]}  score 0-100
 */

#if __cplusplus == 201703L

#include "OpenAFIS.h"

#include <algorithm>
#include <cstdint>
#include <cstdlib>
#include <cstring>
#include <filesystem>
#include <fstream>
#include <iostream>
#include <string>
#include <vector>

using namespace OpenAFIS;

static constexpr unsigned char kIsoMagic[8] = { 'F', 'M', 'R', 0, ' ', '2', '0', 0 };

static void normalizeIso19794(std::vector<uint8_t>& data) {
    if (data.size() < 12) {
        return;
    }
    if (std::memcmp(data.data(), kIsoMagic, sizeof(kIsoMagic)) != 0) {
        return;
    }
    const uint32_t actual = static_cast<uint32_t>(data.size());
    data[8] = static_cast<uint8_t>((actual >> 24) & 0xff);
    data[9] = static_cast<uint8_t>((actual >> 16) & 0xff);
    data[10] = static_cast<uint8_t>((actual >> 8) & 0xff);
    data[11] = static_cast<uint8_t>(actual & 0xff);
}

static bool loadIsoTemplate(
    TemplateISO19794_2_2005<std::string, Fingerprint>& t,
    const std::filesystem::path& path)
{
    std::ifstream f(path, std::ifstream::in | std::ifstream::binary);
    if (!f) {
        return false;
    }
    std::vector<uint8_t> data(
        (std::istreambuf_iterator<char>(f)),
        std::istreambuf_iterator<char>());
    if (data.empty()) {
        return false;
    }
    normalizeIso19794(data);
    return t.load(data.data(), data.size());
}

static std::string argValue(int argc, const char** argv, const std::string& flag) {
    for (int i = 1; i + 1 < argc; ++i) {
        if (flag == argv[i]) {
            return argv[i + 1];
        }
    }
    return {};
}

static bool loadTemplates(
    std::vector<TemplateISO19794_2_2005<std::string, Fingerprint>>& out,
    const std::filesystem::path& dir)
{
    if (!std::filesystem::is_directory(dir)) {
        return false;
    }
    for (const auto& entry : std::filesystem::directory_iterator(dir)) {
        if (!entry.is_regular_file()) {
            continue;
        }
        const auto path = entry.path();
        if (path.extension() != ".iso") {
            continue;
        }
        auto id = path.stem().string();
        auto& t = out.emplace_back(id);
        if (!loadIsoTemplate(t, path)) {
            out.pop_back();
            continue;
        }
        if (t.fingerprints().empty()) {
            out.pop_back();
        }
    }
    return true;
}

int main(int argc, const char** argv) {
    const auto probePath = argValue(argc, argv, "--probe");
    const auto templatesDir = argValue(argc, argv, "--templates");
    const auto minScoreStr = argValue(argc, argv, "--min-score");
    const int minScore = minScoreStr.empty() ? 40 : std::atoi(minScoreStr.c_str());

    if (probePath.empty() || templatesDir.empty()) {
        std::cerr << "usage: iip-openafis-identify --probe FILE --templates DIR [--min-score N]\n";
        return 2;
    }

    TemplateISO19794_2_2005<std::string, Fingerprint> probe("probe");
    if (!loadIsoTemplate(probe, probePath)) {
        std::cout << "{\"matches\":[],\"error\":\"probe_load_failed\"}\n";
        return 1;
    }
    if (probe.fingerprints().empty()) {
        std::cout << "{\"matches\":[],\"error\":\"probe_empty\"}\n";
        return 1;
    }

    std::vector<TemplateISO19794_2_2005<std::string, Fingerprint>> candidates;
    loadTemplates(candidates, templatesDir);
    if (candidates.empty()) {
        std::cout << "{\"matches\":[]}\n";
        return 0;
    }

    struct Ranked {
        std::string id;
        uint8_t score;
    };
    std::vector<Ranked> ranked;
    ranked.reserve(candidates.size());

    MatchSimilarity oneOne;
    for (const auto& cand : candidates) {
        if (cand.fingerprints().empty()) {
            continue;
        }
        uint8_t score{};
        oneOne.compute(score, probe.fingerprints()[0], cand.fingerprints()[0]);
        if (static_cast<int>(score) >= minScore) {
            ranked.push_back({cand.id(), score});
        }
    }

    std::sort(ranked.begin(), ranked.end(), [](const Ranked& a, const Ranked& b) {
        return a.score > b.score;
    });

    std::cout << "{\"matches\":[";
    for (size_t i = 0; i < ranked.size(); ++i) {
        if (i > 0) {
            std::cout << ',';
        }
        std::cout << "{\"id\":\"" << ranked[i].id << "\",\"score\":" << static_cast<int>(ranked[i].score) << '}';
    }
    std::cout << "]}\n";
    return 0;
}

#else
int main() { return 0; }
#endif
