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
    // --- Individual effects (for previewing each stage) ---
    {"passthrough", {"shaders/passthrough.frag"}},
    {"saturation", {"shaders/saturation.frag"}},
    {"xdog", {"shaders/xdog.frag"}},
    {"warm_grade", {"shaders/warm_grade.frag"}},
    {"cool_grade", {"shaders/cool_grade.frag"}},
    {"film_grain", {"shaders/film_grain.frag"}},
    {"chromatic_aberration", {"shaders/chromatic_aberration.frag"}},
    {"posterize", {"shaders/posterize.frag"}},
    {"halftone", {"shaders/halftone.frag"}},
    {"brush_distort", {"shaders/brush_distort.frag"}},
    {"flow_smear", {"shaders/flow_smear.frag"}},
    {"voronoi", {"shaders/voronoi.frag"}},
    {"palette", {"shaders/palette.frag"}},
    {"risograph", {"shaders/risograph.frag"}},
    {"paper_warp", {"shaders/paper_warp.frag"}},
    {"sobel", {"shaders/sobel.frag"}},

    // --- Gaussian blur ---
    {"gaussian", {"shaders/blur_h.frag", "shaders/blur_v.frag"}},
    {"gaussian_heavy",
     {
         "shaders/blur_h_wide.frag",
         "shaders/blur_v_wide.frag",
         "shaders/blur_h_wide.frag",
         "shaders/blur_v_wide.frag",
     }},

    // --- Kuwahara ---
    {"kuwahara", {
        "shaders/sobel.frag",
        "shaders/blur_iso_struct.frag",
        "shaders/kuwahara_aniso.frag",
    }},

    // --- Painterly ---
    // Hal: posterized + XDoG linework, halogen glow
    {"hal", {
        "shaders/saturation.frag",
        "shaders/sobel.frag",
        "shaders/blur_iso_struct.frag",
        "shaders/kuwahara_aniso.frag",
        "shaders/posterize.frag",
        "shaders/brush_distort.frag",
        "shaders/xdog.frag",
        "shaders/film_grain.frag",
    }},
    // Graphic novel
    {"graphic_novel", {
        "shaders/saturation.frag",
        "shaders/sobel.frag",
        "shaders/blur_iso_struct.frag",
        "shaders/kuwahara_aniso.frag",
        "shaders/posterize.frag",
        "shaders/xdog.frag",
        "shaders/cool_grade.frag",
    }},
    // Comic book
    {"comic", {
        "shaders/saturation.frag",
        "shaders/sobel.frag",
        "shaders/blur_iso_struct.frag",
        "shaders/kuwahara_aniso.frag",
        "shaders/posterize.frag",
        "shaders/halftone.frag",
    }},
    // Long shatter: elongated voronoi cells aligned to edge direction
    {"long_shatter", {
        "shaders/saturation.frag",
        "shaders/sobel.frag",
        "shaders/blur_iso_struct.frag",
        "shaders/oil_strokes.frag",
    }},
    {"oil_strokes", {
        "shaders/sobel.frag",
        "shaders/blur_iso_struct.frag",
        "shaders/oil_strokes.frag",
    }},
    // Painterly: kuwahara flattens, brush_distort adds texture, stays natural
    {"painterly", {
        "shaders/saturation.frag",
        "shaders/sobel.frag",
        "shaders/blur_iso_struct.frag",
        "shaders/kuwahara_aniso.frag",
        "shaders/brush_distort.frag",
        "shaders/brush_distort.frag",
        "shaders/film_grain.frag",
    }},
    // Stained glass
    {"stained_glass", {
        "shaders/saturation.frag",
        "shaders/voronoi.frag",
    }},
    // Shatter: tiny voronoi cells fracture the image into color shards
    {"shatter", {
        "shaders/saturation.frag",
        "shaders/pointillist.frag",
        "shaders/chromatic_aberration.frag",
        "shaders/film_grain.frag",
    }},
    {"pointillist", {"shaders/pointillist.frag"}},
    // Risograph / zine
    {"zine", {
        "shaders/paper_warp.frag",
        "shaders/risograph.frag",
        "shaders/film_grain.frag",
    }},
};

static void usage(const char *prog) {
  std::cerr << "Usage: " << prog << " <pipeline> [--preview]\n\n"
            << "Processes all videos in in_videos/ and writes results to "
               "out_videos/.\n"
            << "With --preview, extracts a single frame and saves as PNG.\n\n"
            << "Available pipelines:\n";
  for (auto &[name, _] : PIPELINES) {
    std::cerr << "  " << name << "\n";
  }
}

static bool extractFrame(const std::string &inputPath, double timestamp,
                         int width, int height, int rotation,
                         std::vector<uint8_t> &buffer) {
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
      std::string outName =
          inputPath.stem().string() + "_" + pipelineName + "_preview.png";
      fs::path outputPath = fs::path("out_videos") / outName;

      Video probe_video(inputPath.string(), "");
      probe_video.probe();
      int w = probe_video.meta().width;
      int h = probe_video.meta().height;

      std::vector<uint8_t> frameIn;
      if (!extractFrame(inputPath.string(), 1.0, w, h,
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
