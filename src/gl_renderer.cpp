#include "gl_renderer.h"

#include <cstring>
#include <fstream>
#include <iostream>
#include <sstream>
#include <stdexcept>

// Embedded vertex shader — always the same fullscreen quad, no file dependency
static const char* VERTEX_SHADER_SRC = R"(
#version 410 core
layout (location = 0) in vec2 aPos;
layout (location = 1) in vec2 aTexCoord;
out vec2 TexCoord;
void main() {
    gl_Position = vec4(aPos, 0.0, 1.0);
    TexCoord = aTexCoord;
}
)";

static std::string readFile(const std::string& path) {
    std::ifstream file(path);
    if (!file.is_open()) {
        throw std::runtime_error("Failed to open shader file: " + path);
    }
    std::stringstream ss;
    ss << file.rdbuf();
    return ss.str();
}

static GLuint compileShader(GLenum type, const char* src) {
    GLuint shader = glCreateShader(type);
    glShaderSource(shader, 1, &src, nullptr);
    glCompileShader(shader);

    int success;
    glGetShaderiv(shader, GL_COMPILE_STATUS, &success);
    if (!success) {
        char log[512];
        glGetShaderInfoLog(shader, 512, nullptr, log);
        std::string typeStr = (type == GL_VERTEX_SHADER) ? "VERTEX" : "FRAGMENT";
        throw std::runtime_error("Shader compilation failed (" + typeStr + "):\n" + log);
    }
    return shader;
}

static GLuint linkProgram(GLuint vertShader, GLuint fragShader) {
    GLuint program = glCreateProgram();
    glAttachShader(program, vertShader);
    glAttachShader(program, fragShader);
    glLinkProgram(program);

    int success;
    glGetProgramiv(program, GL_LINK_STATUS, &success);
    if (!success) {
        char log[512];
        glGetProgramInfoLog(program, 512, nullptr, log);
        throw std::runtime_error(std::string("Shader link failed:\n") + log);
    }
    return program;
}

// Fullscreen quad: two triangles covering [-1,1] with UV [0,1]
// Each vertex: x, y, u, v
static const float QUAD_VERTICES[] = {
    -1.0f,  1.0f,  0.0f, 1.0f,
    -1.0f, -1.0f,  0.0f, 0.0f,
     1.0f, -1.0f,  1.0f, 0.0f,

    -1.0f,  1.0f,  0.0f, 1.0f,
     1.0f, -1.0f,  1.0f, 0.0f,
     1.0f,  1.0f,  1.0f, 1.0f,
};

GLRenderer::GLRenderer(int width, int height)
    : m_width(width),
      m_height(height),
      m_window(nullptr),
      m_quadVAO(0),
      m_quadVBO(0),
      m_inputTexture(0),
      m_fbos{0, 0},
      m_fboTextures{0, 0},
      m_pbo(0) {

    if (!glfwInit()) {
        throw std::runtime_error("Failed to initialize GLFW");
    }

    glfwWindowHint(GLFW_CONTEXT_VERSION_MAJOR, 4);
    glfwWindowHint(GLFW_CONTEXT_VERSION_MINOR, 1);
    glfwWindowHint(GLFW_OPENGL_PROFILE, GLFW_OPENGL_CORE_PROFILE);
    glfwWindowHint(GLFW_OPENGL_FORWARD_COMPAT, GL_TRUE);
    glfwWindowHint(GLFW_VISIBLE, GLFW_FALSE); // offscreen

    m_window = glfwCreateWindow(width, height, "video_shaders", nullptr, nullptr);
    if (!m_window) {
        glfwTerminate();
        throw std::runtime_error("Failed to create GLFW window");
    }
    glfwMakeContextCurrent(m_window);

    if (!gladLoadGLLoader((GLADloadproc)glfwGetProcAddress)) {
        glfwDestroyWindow(m_window);
        glfwTerminate();
        throw std::runtime_error("Failed to initialize GLAD");
    }

    glViewport(0, 0, width, height);
    glPixelStorei(GL_PACK_ALIGNMENT, 1);
    glPixelStorei(GL_UNPACK_ALIGNMENT, 1);

    initQuad();
    initFramebuffers();
    initPBOs();

    // Create input texture
    glGenTextures(1, &m_inputTexture);
    glBindTexture(GL_TEXTURE_2D, m_inputTexture);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_LINEAR);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_LINEAR);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_S, GL_CLAMP_TO_EDGE);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_T, GL_CLAMP_TO_EDGE);
    // Allocate storage (data uploaded per-frame)
    glTexImage2D(GL_TEXTURE_2D, 0, GL_RGB8, width, height, 0,
                 GL_RGB, GL_UNSIGNED_BYTE, nullptr);
}

GLRenderer::~GLRenderer() {
    cleanup();
}

void GLRenderer::loadPipeline(const ShaderPipeline& fragmentPaths) {
    // Clean up any existing pipeline
    for (GLuint prog : m_shaderPrograms) {
        glDeleteProgram(prog);
    }
    m_shaderPrograms.clear();

    // Compile vertex shader once
    GLuint vertShader = compileShader(GL_VERTEX_SHADER, VERTEX_SHADER_SRC);

    for (const auto& fragPath : fragmentPaths) {
        std::string fragSrc = readFile(fragPath);
        GLuint fragShader = compileShader(GL_FRAGMENT_SHADER, fragSrc.c_str());
        GLuint program = linkProgram(vertShader, fragShader);
        glDeleteShader(fragShader);

        // Set sampler uniforms: inputTexture on unit 0, originalTexture on unit 1
        glUseProgram(program);
        glUniform1i(glGetUniformLocation(program, "inputTexture"), 0);
        glUniform1i(glGetUniformLocation(program, "originalTexture"), 1);

        m_shaderPrograms.push_back(program);
    }

    glDeleteShader(vertShader);
}

void GLRenderer::renderFrame(const std::vector<uint8_t>& input,
                             std::vector<uint8_t>& output) {
    size_t frameSize = static_cast<size_t>(m_width) * m_height * 3;
    output.resize(frameSize);

    // Upload input pixels to texture
    glBindTexture(GL_TEXTURE_2D, m_inputTexture);
    glTexSubImage2D(GL_TEXTURE_2D, 0, 0, 0, m_width, m_height,
                    GL_RGB, GL_UNSIGNED_BYTE, input.data());

    int numPasses = static_cast<int>(m_shaderPrograms.size());

    for (int i = 0; i < numPasses; i++) {
        // Write to FBO[i % 2]
        glBindFramebuffer(GL_FRAMEBUFFER, m_fbos[i % 2]);

        // Read from: input texture on first pass, previous FBO's texture after
        glActiveTexture(GL_TEXTURE0);
        if (i == 0) {
            glBindTexture(GL_TEXTURE_2D, m_inputTexture);
        } else {
            glBindTexture(GL_TEXTURE_2D, m_fboTextures[(i + 1) % 2]);
        }

        // Bind original frame to texture unit 1 (available as originalTexture)
        glActiveTexture(GL_TEXTURE1);
        glBindTexture(GL_TEXTURE_2D, m_inputTexture);

        glUseProgram(m_shaderPrograms[i]);

        // Set standard uniforms
        GLint resLoc = glGetUniformLocation(m_shaderPrograms[i], "resolution");
        if (resLoc != -1) {
            glUniform2f(resLoc, static_cast<float>(m_width), static_cast<float>(m_height));
        }

        // Draw fullscreen quad
        glBindVertexArray(m_quadVAO);
        glDrawArrays(GL_TRIANGLES, 0, 6);
    }

    // Read back from the FBO that the last pass wrote to
    int lastFbo = (numPasses - 1) % 2;
    glBindFramebuffer(GL_FRAMEBUFFER, m_fbos[lastFbo]);

    // PBO readback: glReadPixels into PBO starts async DMA,
    // glMapBuffer blocks until transfer completes, then we copy out.
    glBindBuffer(GL_PIXEL_PACK_BUFFER, m_pbo);
    glReadPixels(0, 0, m_width, m_height, GL_RGB, GL_UNSIGNED_BYTE, nullptr);

    void* ptr = glMapBuffer(GL_PIXEL_PACK_BUFFER, GL_READ_ONLY);
    if (ptr) {
        std::memcpy(output.data(), ptr, frameSize);
        glUnmapBuffer(GL_PIXEL_PACK_BUFFER);
    }

    glBindBuffer(GL_PIXEL_PACK_BUFFER, 0);
    glBindFramebuffer(GL_FRAMEBUFFER, 0);
}

void GLRenderer::setUniformFloat(const std::string& name, float value) {
    for (GLuint prog : m_shaderPrograms) {
        glUseProgram(prog);
        GLint loc = glGetUniformLocation(prog, name.c_str());
        if (loc != -1) glUniform1f(loc, value);
    }
}

void GLRenderer::setUniformInt(const std::string& name, int value) {
    for (GLuint prog : m_shaderPrograms) {
        glUseProgram(prog);
        GLint loc = glGetUniformLocation(prog, name.c_str());
        if (loc != -1) glUniform1i(loc, value);
    }
}

void GLRenderer::setUniformVec2(const std::string& name, float x, float y) {
    for (GLuint prog : m_shaderPrograms) {
        glUseProgram(prog);
        GLint loc = glGetUniformLocation(prog, name.c_str());
        if (loc != -1) glUniform2f(loc, x, y);
    }
}

void GLRenderer::initQuad() {
    glGenVertexArrays(1, &m_quadVAO);
    glGenBuffers(1, &m_quadVBO);

    glBindVertexArray(m_quadVAO);
    glBindBuffer(GL_ARRAY_BUFFER, m_quadVBO);
    glBufferData(GL_ARRAY_BUFFER, sizeof(QUAD_VERTICES), QUAD_VERTICES, GL_STATIC_DRAW);

    // position: location 0, 2 floats
    glEnableVertexAttribArray(0);
    glVertexAttribPointer(0, 2, GL_FLOAT, GL_FALSE, 4 * sizeof(float), (void*)0);

    // texcoord: location 1, 2 floats
    glEnableVertexAttribArray(1);
    glVertexAttribPointer(1, 2, GL_FLOAT, GL_FALSE, 4 * sizeof(float),
                          (void*)(2 * sizeof(float)));

    glBindVertexArray(0);
}

void GLRenderer::initFramebuffers() {
    glGenFramebuffers(2, m_fbos);
    glGenTextures(2, m_fboTextures);

    for (int i = 0; i < 2; i++) {
        glBindTexture(GL_TEXTURE_2D, m_fboTextures[i]);
        // Use RGBA16F — supports negative values (needed for structure tensor)
        // and is reliably color-renderable on macOS (unlike GL_RGB8)
        glTexImage2D(GL_TEXTURE_2D, 0, GL_RGBA16F, m_width, m_height, 0,
                     GL_RGBA, GL_FLOAT, nullptr);
        glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_LINEAR);
        glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_LINEAR);
        glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_S, GL_CLAMP_TO_EDGE);
        glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_T, GL_CLAMP_TO_EDGE);

        glBindFramebuffer(GL_FRAMEBUFFER, m_fbos[i]);
        glFramebufferTexture2D(GL_FRAMEBUFFER, GL_COLOR_ATTACHMENT0,
                               GL_TEXTURE_2D, m_fboTextures[i], 0);

        if (glCheckFramebufferStatus(GL_FRAMEBUFFER) != GL_FRAMEBUFFER_COMPLETE) {
            throw std::runtime_error("Framebuffer " + std::to_string(i) + " incomplete");
        }
    }
    glBindFramebuffer(GL_FRAMEBUFFER, 0);
}

void GLRenderer::initPBOs() {
    size_t frameSize = static_cast<size_t>(m_width) * m_height * 3;
    glGenBuffers(1, &m_pbo);
    glBindBuffer(GL_PIXEL_PACK_BUFFER, m_pbo);
    glBufferData(GL_PIXEL_PACK_BUFFER, frameSize, nullptr, GL_STREAM_READ);
    glBindBuffer(GL_PIXEL_PACK_BUFFER, 0);
}

void GLRenderer::cleanup() {
    for (GLuint prog : m_shaderPrograms) {
        glDeleteProgram(prog);
    }
    m_shaderPrograms.clear();

    if (m_quadVAO) glDeleteVertexArrays(1, &m_quadVAO);
    if (m_quadVBO) glDeleteBuffers(1, &m_quadVBO);
    if (m_inputTexture) glDeleteTextures(1, &m_inputTexture);
    glDeleteFramebuffers(2, m_fbos);
    glDeleteTextures(2, m_fboTextures);
    if (m_pbo) glDeleteBuffers(1, &m_pbo);

    if (m_window) {
        glfwDestroyWindow(m_window);
        m_window = nullptr;
    }
    glfwTerminate();
}
