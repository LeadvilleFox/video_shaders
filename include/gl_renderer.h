#ifndef GL_RENDERER_H
#define GL_RENDERER_H

#include <glad/glad.h>
#include <GLFW/glfw3.h>

#include <cstdint>
#include <string>
#include <vector>

// An ordered list of fragment shader paths defining a multi-pass pipeline.
// Single-pass effects are just a vector with one entry.
using ShaderPipeline = std::vector<std::string>;

class GLRenderer {
public:
    GLRenderer(int width, int height);
    ~GLRenderer();

    GLRenderer(const GLRenderer&) = delete;
    GLRenderer& operator=(const GLRenderer&) = delete;
    GLRenderer(GLRenderer&&) = delete;
    GLRenderer& operator=(GLRenderer&&) = delete;

    // Compile and link all shaders for a pipeline.
    // Must be called before renderFrame.
    void loadPipeline(const ShaderPipeline& fragmentPaths);

    // Upload frame pixels, run all shader passes, read back the result.
    void renderFrame(const std::vector<uint8_t>& input,
                     std::vector<uint8_t>& output);

    // Set a uniform on every shader in the current pipeline
    void setUniformFloat(const std::string& name, float value);
    void setUniformInt(const std::string& name, int value);
    void setUniformVec2(const std::string& name, float x, float y);

private:
    int m_width;
    int m_height;
    GLFWwindow* m_window;

    // Fullscreen quad VAO/VBO
    GLuint m_quadVAO;
    GLuint m_quadVBO;

    // Input texture (uploaded each frame)
    GLuint m_inputTexture;

    // Ping-pong framebuffers + textures for multi-pass
    GLuint m_fbos[2];
    GLuint m_fboTextures[2];

    // PBO for readback
    GLuint m_pbo;

    // Compiled shader programs for the current pipeline
    std::vector<GLuint> m_shaderPrograms;

    void initQuad();
    void initFramebuffers();
    void initPBOs();
    void cleanup();
};

#endif
