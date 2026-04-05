#include "gl_renderer.h"
#include "video.h"

#define STB_IMAGE_WRITE_IMPLEMENTATION
#include "stb_image_write.h"

#include <cstdio>
#include <filesystem>
#include <iostream>
#include <map>
#include <sstream>
#include <string>
#include <vector>

namespace fs = std::filesystem;

static const std::map<std::string, ShaderPipeline> PIPELINES = {
    {"passthrough", {"shaders/passthrough.frag"}},
    {"gaussian", {"shaders/blur_h.frag", "shaders/blur_v.frag"}},
    {"gaussian_heavy",
     {
         "shaders/blur_h_wide.frag",
         "shaders/blur_v_wide.frag",
         "shaders/blur_h_wide.frag",
         "shaders/blur_v_wide.frag",
     }},
    {"kuwahara", {"shaders/kuwahara.frag"}},
    {"kuwahara_fast", {"shaders/kuwahara_h.frag", "shaders/kuwahara_v.frag"}},
    {"kuwahara_fast_strong",
     {
         "shaders/kuwahara_h.frag",
         "shaders/kuwahara_v.frag",
         "shaders/kuwahara_h.frag",
         "shaders/kuwahara_v.frag",
     }},
    {"kuwahara_strong",
     {
         "shaders/kuwahara.frag",
         "shaders/kuwahara.frag",
     }},
    {"sobel", {"shaders/sobel.frag"}},
    {"struct_tensor", {"shaders/sobel.frag", "shaders/blur_iso_struct.frag"}},
    {"kuwahara_aniso",
     {
         "shaders/sobel.frag",
         "shaders/blur_iso_struct.frag",
         "shaders/kuwahara_aniso.frag",
     }},
    {"kuwahara_aniso_strong",
     {
         "shaders/sobel.frag",
         "shaders/blur_iso_struct.frag",
         "shaders/kuwahara_aniso.frag",
         "shaders/kuwahara.frag",
     }},
};

static void usage(const char *prog) {
  std::cerr << "Usage: " << prog << " <pipeline> [--preview]\n\n"
            << "Processes all videos in in_videos/ and writes results to "
               "out_videos/.\n"
            << "With --preview, extracts a single frame and saves as PNG (fast "
               "prototyping).\n\n"
            << "Available pipelines:\n";
  for (auto &[name, _] : PIPELINES) {
    std::cerr << "  " << name << "\n";
  }
}

// Extract a single frame at the given timestamp (seconds) using ffmpeg
static bool extractFrame(const std::string &inputPath, double timestamp,
                         int width, int height, int rotation,
                         std::vector<uint8_t> &buffer) {
  // Build transpose filter if needed
  std::string vf;
  int absRot = std::abs(rotation);
  if (rotation == -90 || rotation == 270) {
    vf = " -vf transpose=1";
  } else if (rotation == 90 || rotation == -270) {
    vf = " -vf transpose=2";
  } else if (absRot == 180) {
    vf = " -vf \"transpose=1,transpose=1\"";
  }

  std::ostringstream cmd;
  cmd << "ffmpeg -v error -noautorotate"
      << " -ss " << timestamp << " -i \"" << inputPath << "\"" << vf
      << " -frames:v 1 -f rawvideo -pix_fmt rgb24 pipe:1";

  FILE *pipe = popen(cmd.str().c_str(), "r");
  if (!pipe)
    return false;

  size_t frameSize = static_cast<size_t>(width) * height * 3;
  buffer.resize(frameSize);
  size_t bytesRead = fread(buffer.data(), 1, frameSize, pipe);
  pclose(pipe);

  return bytesRead == frameSize;
}

int main(int argc, char *argv[]) {
  if (argc < 2) {
    usage(argv[0]);
    return 1;
  }

  std::string pipelineName = argv[1];
  bool preview = false;
  for (int i = 2; i < argc; i++) {
    if (std::string(argv[i]) == "--preview")
      preview = true;
  }

  auto it = PIPELINES.find(pipelineName);
  if (it == PIPELINES.end()) {
    std::cerr << "Unknown pipeline: " << pipelineName << "\n";
    usage(argv[0]);
    return 1;
  }
  const ShaderPipeline &pipeline = it->second;

  // Collect input videos
  std::vector<fs::path> inputs;
  for (auto &entry : fs::directory_iterator("in_videos")) {
    if (!entry.is_regular_file())
      continue;
    auto ext = entry.path().extension().string();
    for (auto &c : ext)
      c = std::tolower(c);
    if (ext == ".mp4" || ext == ".mov" || ext == ".mkv" || ext == ".avi" ||
        ext == ".webm") {
      inputs.push_back(entry.path());
    }
  }

  if (inputs.empty()) {
    std::cerr << "No video files found in in_videos/\n";
    return 1;
  }

  std::sort(inputs.begin(), inputs.end());
  fs::create_directories("out_videos");

  for (auto &inputPath : inputs) {
    if (preview) {
      // --- Preview mode: single frame → PNG ---
      std::string outName =
          inputPath.stem().string() + "_" + pipelineName + "_preview.png";
      fs::path outputPath = fs::path("out_videos") / outName;

      // Probe to get dimensions and rotation
      Video probe_video(inputPath.string(), "");
      probe_video.probe();
      int w = probe_video.meta().width;
      int h = probe_video.meta().height;

      // Extract a frame at 1 second in (avoids black intro frames)
      std::vector<uint8_t> frameIn;
      double timestamp =
          std::min(1.0, 0.5 / probe_video.meta().fps *
                            30); // 1s or half the video if very short
      if (!extractFrame(inputPath.string(), timestamp, w, h,
                        probe_video.meta().rotation, frameIn)) {
        std::cerr << "Failed to extract preview frame from " << inputPath
                  << "\n";
        continue;
      }

      GLRenderer renderer(w, h);
      renderer.loadPipeline(pipeline);

      std::vector<uint8_t> frameOut;
      renderer.renderFrame(frameIn, frameOut);

      stbi_write_png(outputPath.string().c_str(), w, h, 3, frameOut.data(),
                     w * 3);

      std::cout << inputPath.filename().string() << " -> "
                << outputPath.string() << std::endl;
    } else {
      // --- Full video mode ---
      std::string outName =
          inputPath.stem().string() + "_" + pipelineName + ".mp4";
      fs::path outputPath = fs::path("out_videos") / outName;

      std::cout << inputPath.filename().string() << " -> "
                << outputPath.string() << std::endl;

      Video video(inputPath.string(), outputPath.string());
      video.probe();
      video.openPipes();

      GLRenderer renderer(video.meta().width, video.meta().height);
      renderer.loadPipeline(pipeline);

      std::vector<uint8_t> frameIn, frameOut;
      int frameCount = 0;

      while (video.readFrame(frameIn)) {
        renderer.renderFrame(frameIn, frameOut);
        video.writeFrame(frameOut);
        frameCount++;

        if (frameCount % 30 == 0) {
          std::cout << "  " << frameCount << " frames..." << std::endl;
        }
      }

      video.close();
      std::cout << "  Done. " << frameCount << " frames." << std::endl;
    }
  }

  return 0;
}
