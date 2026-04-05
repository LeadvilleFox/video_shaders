#include "video.h"

#include <algorithm>
#include <array>
#include <cmath>
#include <cstdio>
#include <iostream>
#include <sstream>
#include <stdexcept>

// Run a command and return its stdout as a string
static std::string execCommand(const std::string& cmd) {
    std::array<char, 256> buf;
    std::string result;
    FILE* pipe = popen(cmd.c_str(), "r");
    if (!pipe) {
        throw std::runtime_error("popen failed: " + cmd);
    }
    while (fgets(buf.data(), buf.size(), pipe) != nullptr) {
        result += buf.data();
    }
    int status = pclose(pipe);
    if (status != 0) {
        throw std::runtime_error("Command failed (exit " + std::to_string(status) + "): " + cmd);
    }
    return result;
}

// Trim whitespace from both ends
static std::string trim(const std::string& s) {
    size_t start = s.find_first_not_of(" \t\n\r");
    if (start == std::string::npos) return "";
    size_t end = s.find_last_not_of(" \t\n\r");
    return s.substr(start, end - start + 1);
}

Video::Video(const std::string& inputPath, const std::string& outputPath)
    : m_inputPath(inputPath),
      m_outputPath(outputPath),
      m_meta{0, 0, 0.0, "", ""},
      m_decodePipe(nullptr),
      m_encodePipe(nullptr) {}

Video::~Video() {
    close();
}

void Video::probe() {
    // Use ffprobe with JSON output for reliable field access
    std::string cmd = "ffprobe -v error -select_streams v:0"
                      " -show_entries stream=width,height,r_frame_rate,codec_name,pix_fmt"
                      " -of json \"" + m_inputPath + "\"";

    std::string output = execCommand(cmd);

    // Minimal JSON parsing — extract values by key.
    // The output structure is: { "streams": [{ "width": N, ... }] }
    auto extractString = [&](const std::string& key) -> std::string {
        std::string needle = "\"" + key + "\": \"";
        size_t pos = output.find(needle);
        if (pos == std::string::npos) {
            throw std::runtime_error("ffprobe: missing field '" + key + "'");
        }
        pos += needle.size();
        size_t end = output.find('"', pos);
        return output.substr(pos, end - pos);
    };

    auto extractInt = [&](const std::string& key) -> int {
        // Integer fields have no quotes: "width": 1920
        std::string needle = "\"" + key + "\": ";
        size_t pos = output.find(needle);
        if (pos == std::string::npos) {
            throw std::runtime_error("ffprobe: missing field '" + key + "'");
        }
        pos += needle.size();
        return std::stoi(output.substr(pos));
    };

    m_meta.width = extractInt("width");
    m_meta.height = extractInt("height");
    m_meta.codec = extractString("codec_name");
    m_meta.pix_fmt = extractString("pix_fmt");

    // r_frame_rate is a string fraction like "30/1"
    std::string fpsStr = extractString("r_frame_rate");
    size_t slash = fpsStr.find('/');
    if (slash != std::string::npos) {
        double num = std::stod(fpsStr.substr(0, slash));
        double den = std::stod(fpsStr.substr(slash + 1));
        m_meta.fps = num / den;
    } else {
        m_meta.fps = std::stod(fpsStr);
    }

    // Probe rotation from side_data (may not exist — default to 0)
    m_meta.rotation = 0;
    std::string rotCmd = "ffprobe -v error -select_streams v:0"
                         " -show_entries stream_side_data=rotation"
                         " -of csv=p=0 \"" + m_inputPath + "\"";
    try {
        std::string rotOutput = trim(execCommand(rotCmd));
        // Output is like ",-90" — find the number after comma
        size_t comma = rotOutput.find(',');
        if (comma != std::string::npos) {
            m_meta.rotation = std::stoi(rotOutput.substr(comma + 1));
        } else if (!rotOutput.empty()) {
            m_meta.rotation = std::stoi(rotOutput);
        }
    } catch (...) {
        // No rotation metadata — that's fine
    }

    // ffmpeg auto-rotates during decode, so if the stored video has ±90°
    // rotation, the decoded frames will be transposed. Swap our dimensions
    // to match what the decoder actually outputs.
    int absRot = std::abs(m_meta.rotation);
    if (absRot == 90 || absRot == 270) {
        std::swap(m_meta.width, m_meta.height);
    }

    std::cout << "Probed: " << m_meta.width << "x" << m_meta.height
              << " @ " << m_meta.fps << " fps"
              << ", codec=" << m_meta.codec
              << ", pix_fmt=" << m_meta.pix_fmt
              << ", rotation=" << m_meta.rotation << std::endl;
}

void Video::openPipes() {
    if (m_meta.width == 0 || m_meta.height == 0) {
        throw std::runtime_error("Must call probe() before openPipes()");
    }

    // Decode: input file -> raw rgb24 on stdout
    // Use -noautorotate and apply rotation explicitly via transpose filter,
    // since ffmpeg's auto-rotation can apply the wrong direction.
    std::string vf;
    int absRot = std::abs(m_meta.rotation);
    if (m_meta.rotation == -90 || m_meta.rotation == 270) {
        vf = " -vf transpose=1";  // 90° clockwise
    } else if (m_meta.rotation == 90 || m_meta.rotation == -270) {
        vf = " -vf transpose=2";  // 90° counter-clockwise
    } else if (absRot == 180) {
        vf = " -vf \"transpose=1,transpose=1\"";  // 180°
    }

    std::string decodeCmd = "ffmpeg -v error -noautorotate"
                            " -i \"" + m_inputPath + "\""
                            + vf +
                            " -f rawvideo -pix_fmt rgb24 pipe:1";
    m_decodePipe = popen(decodeCmd.c_str(), "r");
    if (!m_decodePipe) {
        throw std::runtime_error("Failed to open decode pipe");
    }

    // Encode: raw rgb24 on stdin (video) + original file (audio) -> output file
    // -y to overwrite without prompting
    // Input 0: raw video from pipe
    // Input 1: original file (for audio stream)
    // Map video from input 0, audio from input 1
    std::ostringstream encodeCmd;
    encodeCmd << "ffmpeg -v error -y"
              << " -f rawvideo -pix_fmt rgb24"
              << " -s " << m_meta.width << "x" << m_meta.height
              << " -r " << m_meta.fps
              << " -i pipe:0"
              << " -i \"" << m_inputPath << "\""
              << " -map 0:v:0 -map 1:a:0?"
              << " -c:v libx264 -pix_fmt yuv420p"
              << " -c:a copy"
              << " \"" << m_outputPath << "\"";
    m_encodePipe = popen(encodeCmd.str().c_str(), "w");
    if (!m_encodePipe) {
        pclose(m_decodePipe);
        m_decodePipe = nullptr;
        throw std::runtime_error("Failed to open encode pipe");
    }
}

bool Video::readFrame(std::vector<uint8_t>& buffer) {
    if (!m_decodePipe) return false;

    size_t frameSize = m_meta.width * m_meta.height * 3;
    buffer.resize(frameSize);

    size_t bytesRead = fread(buffer.data(), 1, frameSize, m_decodePipe);
    if (bytesRead < frameSize) {
        return false;
    }
    return true;
}

void Video::writeFrame(const std::vector<uint8_t>& buffer) {
    if (!m_encodePipe) {
        throw std::runtime_error("Encode pipe not open");
    }
    size_t written = fwrite(buffer.data(), 1, buffer.size(), m_encodePipe);
    if (written < buffer.size()) {
        throw std::runtime_error("Failed to write full frame to encode pipe");
    }
}

void Video::close() {
    if (m_decodePipe) {
        pclose(m_decodePipe);
        m_decodePipe = nullptr;
    }
    if (m_encodePipe) {
        pclose(m_encodePipe);
        m_encodePipe = nullptr;
    }
}

const VideoMeta& Video::meta() const { return m_meta; }
const std::string& Video::inputPath() const { return m_inputPath; }
const std::string& Video::outputPath() const { return m_outputPath; }
