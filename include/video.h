#ifndef VIDEO_H
#define VIDEO_H

#include <cstdint>
#include <string>
#include <vector>

struct VideoMeta {
    int width;
    int height;
    double fps;
    std::string codec;
    std::string pix_fmt;
    int rotation; // degrees (0, 90, -90, 180)
};

class Video {
public:
    Video(const std::string& inputPath, const std::string& outputPath);
    ~Video();

    Video(const Video&) = delete;
    Video& operator=(const Video&) = delete;

    // Probe input file and populate metadata
    void probe();

    // Start the decode and encode ffmpeg child processes
    void openPipes();

    // Read the next decoded frame into the buffer.
    // Returns false when there are no more frames.
    bool readFrame(std::vector<uint8_t>& buffer);

    // Write a processed frame to the encoder
    void writeFrame(const std::vector<uint8_t>& buffer);

    // Close pipes and wait for child processes to finish
    void close();

    const VideoMeta& meta() const;
    const std::string& inputPath() const;
    const std::string& outputPath() const;

private:
    std::string m_inputPath;
    std::string m_outputPath;
    std::string m_outputFormat; // empty = match input
    VideoMeta m_meta;
    FILE* m_decodePipe;
    FILE* m_encodePipe;
};

#endif
