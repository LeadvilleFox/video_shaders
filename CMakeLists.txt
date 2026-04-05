cmake_minimum_required(VERSION 3.23.0)

project(video_shaders)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_EXPORT_COMPILE_COMMANDS ON)

add_executable(video_shaders src/main.cpp)

target_sources(video_shaders
  PRIVATE
  third_party/glad/src/glad.c
  third_party/stb/stb_image.cpp
  src/shaders.cpp
  src/gl_renderer.cpp
  src/video.cpp

  PUBLIC
    FILE_SET HEADERS
    BASE_DIRS
      include
    FILES
      include/shaders.h
      include/gl_renderer.h
      include/video.h
)

target_link_libraries(video_shaders
  PRIVATE /Users/user/code/glfw-3.4/build/src/libglfw3.a
  "-framework Cocoa"
  "-framework IOKit"
  "-framework CoreFoundation"
  "-framework CoreVideo"
  "-framework OpenGL"
)

target_include_directories(video_shaders
  PRIVATE
  third_party/glad/include
  third_party/stb
  /Users/user/code/glfw-3.4/include/
  include
)

# --- Tests ---
enable_testing()

add_executable(test_video tests/test_video.cpp src/video.cpp)
target_include_directories(test_video PRIVATE include third_party)
add_test(NAME test_video COMMAND test_video)

add_executable(test_gl_renderer
  tests/test_gl_renderer.cpp
  src/gl_renderer.cpp
  src/video.cpp
  third_party/glad/src/glad.c
)
target_include_directories(test_gl_renderer
  PRIVATE include third_party third_party/glad/include
  /Users/user/code/glfw-3.4/include/
)
target_link_libraries(test_gl_renderer
  PRIVATE /Users/user/code/glfw-3.4/build/src/libglfw3.a
  "-framework Cocoa"
  "-framework IOKit"
  "-framework CoreFoundation"
  "-framework CoreVideo"
  "-framework OpenGL"
)
add_test(NAME test_gl_renderer COMMAND test_gl_renderer)

add_executable(test_integration
  tests/test_integration.cpp
  src/gl_renderer.cpp
  src/video.cpp
  third_party/glad/src/glad.c
)
target_include_directories(test_integration
  PRIVATE include third_party third_party/glad/include
  /Users/user/code/glfw-3.4/include/
)
target_link_libraries(test_integration
  PRIVATE /Users/user/code/glfw-3.4/build/src/libglfw3.a
  "-framework Cocoa"
  "-framework IOKit"
  "-framework CoreFoundation"
  "-framework CoreVideo"
  "-framework OpenGL"
)
add_test(NAME test_integration COMMAND test_integration)
