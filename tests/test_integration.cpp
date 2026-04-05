#define DOCTEST_CONFIG_IMPLEMENT_WITH_MAIN
#include "doctest/doctest.h"
#include "gl_renderer.h"
#include "video.h"

#include <cmath>
#include <cstdio>
#include <string>
#include <vector>

struct TestVideo {
    const char* path;
    int width;
    int height;
};

static TestVideo TEST_VIDEOS[] = {
    {"test_data/landscape_1080p.mp4", 1920, 1080},
    {"test_data/portrait_720p.mp4", 720, 1280},
    {"test_data/small_480p.mp4", 640, 480},
};

TEST_CASE("end-to-end passthrough at multiple resolutions") {
    for (auto& tv : TEST_VIDEOS) {
        CAPTURE(tv.path);

        std::string output = std::string("test_data/out_pass_") + std::to_string(tv.width) + ".mp4";
        std::remove(output.c_str());

        Video video(tv.path, output);
        video.probe();
        video.openPipes();

        GLRenderer renderer(video.meta().width, video.meta().height);
        renderer.loadPipeline({ "shaders/passthrough.frag" });

        std::vector<uint8_t> frameIn, frameOut;
        int count = 0;
        while (video.readFrame(frameIn)) {
            renderer.renderFrame(frameIn, frameOut);
            video.writeFrame(frameOut);
            count++;
        }
        video.close();

        CHECK(count > 0);
        MESSAGE(tv.path << ": " << count << " frames");

        Video result(output, "");
        result.probe();
        CHECK(result.meta().width == tv.width);
        CHECK(result.meta().height == tv.height);

        std::remove(output.c_str());
    }
}

TEST_CASE("end-to-end Gaussian blur (2-pass)") {
    // Use the small video for speed
    const char* input = "test_data/small_480p.mp4";
    const char* output = "test_data/out_blur.mp4";
    std::remove(output);

    Video video(input, output);
    video.probe();
    video.openPipes();

    GLRenderer renderer(video.meta().width, video.meta().height);
    renderer.loadPipeline({ "shaders/blur_h.frag", "shaders/blur_v.frag" });

    std::vector<uint8_t> frameIn, frameOut;
    int count = 0;
    while (video.readFrame(frameIn)) {
        renderer.renderFrame(frameIn, frameOut);
        video.writeFrame(frameOut);
        count++;
    }
    video.close();

    CHECK(count > 0);

    Video result(output, "");
    result.probe();
    CHECK(result.meta().width == 640);
    CHECK(result.meta().height == 480);

    std::remove(output);
}

TEST_CASE("blur output differs from passthrough") {
    const char* output = "test_data/out_diff.mp4";
    Video video("test_data/small_480p.mp4", output);
    video.probe();
    video.openPipes();

    std::vector<uint8_t> frame;
    REQUIRE(video.readFrame(frame));
    video.close();

    int w = video.meta().width;
    int h = video.meta().height;

    GLRenderer renderer(w, h);

    renderer.loadPipeline({ "shaders/passthrough.frag" });
    std::vector<uint8_t> passOut;
    renderer.renderFrame(frame, passOut);

    renderer.loadPipeline({ "shaders/blur_h.frag", "shaders/blur_v.frag" });
    std::vector<uint8_t> blurOut;
    renderer.renderFrame(frame, blurOut);

    REQUIRE(passOut.size() == blurOut.size());

    double totalDiff = 0.0;
    for (size_t i = 0; i < passOut.size(); i++) {
        totalDiff += std::abs(static_cast<int>(blurOut[i]) - static_cast<int>(passOut[i]));
    }
    double avgDiff = totalDiff / passOut.size();
    MESSAGE("Avg difference: " << avgDiff);
    CHECK(avgDiff > 0.5);

    std::remove(output);
}

TEST_CASE("multi-pass produces spatially correct output") {
    const char* outFile = "test_data/out_spatial.mp4";
    Video video("test_data/small_480p.mp4", outFile);
    video.probe();
    video.openPipes();

    std::vector<uint8_t> frame;
    REQUIRE(video.readFrame(frame));
    video.close();

    int w = video.meta().width;
    int h = video.meta().height;

    GLRenderer renderer(w, h);
    renderer.loadPipeline({ "shaders/blur_h.frag", "shaders/blur_v.frag" });

    std::vector<uint8_t> output;
    renderer.renderFrame(frame, output);

    // Blurred image should have smooth horizontal neighbors
    double horizDiff = 0.0;
    int samples = 0;
    for (int y = 0; y < h; y += 10) {
        for (int x = 0; x < w - 1; x++) {
            int idx = (y * w + x) * 3;
            int next = idx + 3;
            for (int c = 0; c < 3; c++) {
                horizDiff += std::abs(static_cast<int>(output[idx + c]) -
                                      static_cast<int>(output[next + c]));
            }
            samples++;
        }
    }
    double avgHorizDiff = horizDiff / (samples * 3);
    MESSAGE("Avg horizontal neighbor diff: " << avgHorizDiff);
    CHECK(avgHorizDiff < 5.0);

    std::remove(outFile);
}
