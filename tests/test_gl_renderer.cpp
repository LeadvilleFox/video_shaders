#define DOCTEST_CONFIG_IMPLEMENT_WITH_MAIN
#include "doctest/doctest.h"
#include "gl_renderer.h"
#include "video.h"

#include <cmath>
#include <cstdio>
#include <vector>

static const char* PASSTHROUGH_FRAG = "shaders/passthrough.frag";

TEST_CASE("GLRenderer initializes and cleans up") {
    GLRenderer renderer(64, 64);
}

TEST_CASE("passthrough preserves frame data") {
    Video video("test_data/small_480p.mp4", "test_data/out_gl_tmp.mp4");
    video.probe();
    video.openPipes();

    std::vector<uint8_t> frame;
    REQUIRE(video.readFrame(frame));
    video.close();

    int w = video.meta().width;
    int h = video.meta().height;

    GLRenderer renderer(w, h);
    renderer.loadPipeline({ PASSTHROUGH_FRAG });

    std::vector<uint8_t> output;
    renderer.renderFrame(frame, output);

    REQUIRE(output.size() == frame.size());

    double totalDiff = 0.0;
    for (size_t i = 0; i < frame.size(); i++) {
        totalDiff += std::abs(static_cast<int>(output[i]) - static_cast<int>(frame[i]));
    }
    double avgDiff = totalDiff / frame.size();
    MESSAGE("Average per-byte difference: " << avgDiff);
    CHECK(avgDiff < 2.0);

    std::remove("test_data/out_gl_tmp.mp4");
}

TEST_CASE("renderer handles multiple frames") {
    Video video("test_data/small_480p.mp4", "test_data/out_gl_tmp.mp4");
    video.probe();
    video.openPipes();

    GLRenderer renderer(video.meta().width, video.meta().height);
    renderer.loadPipeline({ PASSTHROUGH_FRAG });

    std::vector<uint8_t> frame, output;
    int count = 0;
    while (video.readFrame(frame) && count < 5) {
        renderer.renderFrame(frame, output);
        CHECK(output.size() == frame.size());
        count++;
    }
    CHECK(count == 5);
    video.close();

    std::remove("test_data/out_gl_tmp.mp4");
}

TEST_CASE("pipeline reload does not leak") {
    GLRenderer renderer(64, 64);
    renderer.loadPipeline({ PASSTHROUGH_FRAG });
    renderer.loadPipeline({ PASSTHROUGH_FRAG });

    std::vector<uint8_t> input(64 * 64 * 3, 128);
    std::vector<uint8_t> output;
    renderer.renderFrame(input, output);
    CHECK(output.size() == input.size());
}

TEST_CASE("works at different resolutions") {
    struct Res { int w; int h; };
    Res resolutions[] = { {640, 480}, {1920, 1080}, {720, 1280} };

    for (auto& r : resolutions) {
        CAPTURE(r.w); CAPTURE(r.h);
        GLRenderer renderer(r.w, r.h);
        renderer.loadPipeline({ PASSTHROUGH_FRAG });

        std::vector<uint8_t> input(r.w * r.h * 3, 100);
        std::vector<uint8_t> output;
        renderer.renderFrame(input, output);
        CHECK(output.size() == input.size());
    }
}
