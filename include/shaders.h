#ifndef SHADERS_H
#define SHADERS_H

#include <glad/glad.h>

#include <string>

class Shader {
public:
  // program ID
  unsigned int ID;

  // construcotr reads and builds the shader
  Shader(const char *vertexPath, const char *fragmentPath);

  // use/activate the shader.
  void use();

  // utility uniform functions
  void setBool(const std::string &name, bool value) const;
  void setInt(const std::string &name, int value) const;
  void setFloat(const std::string &name, float value) const;
  void setVec2(const std::string &name, float x, float y) const;
};

#endif
