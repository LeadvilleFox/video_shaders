#include "video.h"
#include "gl_renderer.h"

#include <iostream>
#include <string>
#include <vector>

int main(int argc, char* argv[]) {
    // --- Configuration ---
    std::string inputPath = "videos/guitar_practice.MOV";
    std::string outputPath = "videos/output.mp4";

    // Aggressive Gaussian blur: 4 passes (H→V→H→V) of a wide 25-tap kernel
    ShaderPipeline pipeline = {
        "shaders/blur_h_wide.frag",
        "shaders/blur_v_wide.frag",
        "shaders/blur_h_wide.frag",
        "shaders/blur_v_wide.frag",
    };

    // --- Setup ---
    Video video(inputPath, outputPath);
    video.probe();
    video.openPipes();

    GLRenderer renderer(video.meta().width, video.meta().height);
    renderer.loadPipeline(pipeline);

    // --- Process frames ---
    std::vector<uint8_t> frameIn, frameOut;
    int frameCount = 0;

    while (video.readFrame(frameIn)) {
        renderer.renderFrame(frameIn, frameOut);
        video.writeFrame(frameOut);
        frameCount++;

        if (frameCount % 30 == 0) {
            std::cout << "Processed " << frameCount << " frames..." << std::endl;
        }
    }

    video.close();
    std::cout << "Done. " << frameCount << " frames written to " << outputPath << std::endl;

    return 0;
}
