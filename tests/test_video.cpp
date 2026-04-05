#define DOCTEST_CONFIG_IMPLEMENT_WITH_MAIN
#include "doctest/doctest.h"
#include "video.h"

#include <cstdio>
#include <vector>

TEST_CASE("probe landscape 1080p h264") {
    Video video("test_data/landscape_1080p.mp4", "test_data/out_probe.mp4");
    video.probe();

    CHECK(video.meta().width == 1920);
    CHECK(video.meta().height == 1080);
    CHECK(video.meta().fps == doctest::Approx(30.0).epsilon(0.01));
    CHECK(video.meta().codec == "h264");
    CHECK(video.meta().rotation == 0);
}

TEST_CASE("probe portrait 720p hevc") {
    Video video("test_data/portrait_720p.mp4", "test_data/out_probe.mp4");
    video.probe();

    CHECK(video.meta().width == 720);
    CHECK(video.meta().height == 1280);
    CHECK(video.meta().fps == doctest::Approx(24.0).epsilon(0.01));
    CHECK(video.meta().codec == "hevc");
}

TEST_CASE("probe small 480p 60fps") {
    Video video("test_data/small_480p.mp4", "test_data/out_probe.mp4");
    video.probe();

    CHECK(video.meta().width == 640);
    CHECK(video.meta().height == 480);
    CHECK(video.meta().fps == doctest::Approx(60.0).epsilon(0.01));
    CHECK(video.meta().codec == "h264");
}

TEST_CASE("read frames from each video") {
    struct TestCase {
        const char* path;
        int expectedWidth;
        int expectedHeight;
    };
    TestCase cases[] = {
        {"test_data/landscape_1080p.mp4", 1920, 1080},
        {"test_data/portrait_720p.mp4", 720, 1280},
        {"test_data/small_480p.mp4", 640, 480},
    };

    for (auto& tc : cases) {
        CAPTURE(tc.path);
        Video video(tc.path, "test_data/out_read.mp4");
        video.probe();
        video.openPipes();

        size_t frameSize = video.meta().width * video.meta().height * 3;
        std::vector<uint8_t> buffer;

        bool ok = video.readFrame(buffer);
        CHECK(ok);
        CHECK(buffer.size() == frameSize);

        // Frame data should not be all zeros
        bool allZero = true;
        for (size_t i = 0; i < buffer.size(); i += 1024) {
            if (buffer[i] != 0) { allZero = false; break; }
        }
        CHECK_FALSE(allZero);

        video.close();
        std::remove("test_data/out_read.mp4");
    }
}

TEST_CASE("passthrough round-trip preserves dimensions") {
    const char* input = "test_data/landscape_1080p.mp4";
    const char* output = "test_data/out_roundtrip.mp4";
    std::remove(output);

    Video video(input, output);
    video.probe();
    video.openPipes();

    std::vector<uint8_t> buffer;
    int frameCount = 0;
    while (video.readFrame(buffer)) {
        video.writeFrame(buffer);
        frameCount++;
    }
    video.close();

    CHECK(frameCount > 0);
    MESSAGE("Processed " << frameCount << " frames");

    Video result(output, "");
    result.probe();
    CHECK(result.meta().width == 1920);
    CHECK(result.meta().height == 1080);

    std::remove(output);
}

TEST_CASE("audio passthrough") {
    const char* input = "test_data/landscape_1080p.mp4";
    const char* output = "test_data/out_audio.mp4";
    std::remove(output);

    Video video(input, output);
    video.probe();
    video.openPipes();

    std::vector<uint8_t> buffer;
    int count = 0;
    while (video.readFrame(buffer) && count < 10) {
        video.writeFrame(buffer);
        count++;
    }
    video.close();

    // Verify output has an audio stream
    std::string cmd = "ffprobe -v error -select_streams a:0"
                      " -show_entries stream=codec_type"
                      " -of csv=p=0 \"" + std::string(output) + "\"";
    FILE* pipe = popen(cmd.c_str(), "r");
    REQUIRE(pipe);
    char buf[64] = {0};
    fgets(buf, sizeof(buf), pipe);
    pclose(pipe);

    std::string result(buf);
    CHECK(result.find("audio") != std::string::npos);

    std::remove(output);
}
