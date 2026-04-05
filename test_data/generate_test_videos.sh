#!/bin/bash
# Generate synthetic test videos for the test suite.
# Run this once after cloning the repo.
set -e
cd "$(dirname "$0")"

echo "Generating test videos..."

# 1080p landscape, h264, 2 seconds @ 30fps
ffmpeg -y -v error \
  -f lavfi -i "testsrc2=s=1920x1080:r=30:d=2" \
  -f lavfi -i "sine=frequency=440:duration=2" \
  -c:v libx264 -pix_fmt yuv420p -c:a aac \
  landscape_1080p.mp4

# 720p portrait (rotated), hevc, 2 seconds @ 24fps
ffmpeg -y -v error \
  -f lavfi -i "smptebars=s=1280x720:r=24:d=2" \
  -c:v libx265 -pix_fmt yuv420p -tag:v hvc1 \
  portrait_720p.mp4
# Apply rotation metadata via a re-mux with transpose
ffmpeg -y -v error \
  -i portrait_720p.mp4 \
  -vf "transpose=1" \
  -c:v libx265 -pix_fmt yuv420p -tag:v hvc1 \
  portrait_720p_rot.mp4
mv portrait_720p_rot.mp4 portrait_720p.mp4

# 480p small, h264, 1 second @ 60fps (tests high framerate + small size)
ffmpeg -y -v error \
  -f lavfi -i "testsrc=s=640x480:r=60:d=1" \
  -c:v libx264 -pix_fmt yuv420p \
  small_480p.mp4

echo "Done. Generated:"
ls -lh landscape_1080p.mp4 portrait_720p.mp4 small_480p.mp4
