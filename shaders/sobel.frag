#version 410 core

in vec2 TexCoord;
out vec4 FragColor;

uniform sampler2D inputTexture;
uniform vec2 resolution;

// Compute image gradients and output structure tensor components.
// Output: (Ix^2, Iy^2, Ix*Iy, gradient magnitude)

void main() {
    vec2 t = 1.0 / resolution;

    // Convert to luminance for gradient computation
    float tl = dot(texture(inputTexture, TexCoord + vec2(-1, -1) * t).rgb, vec3(0.299, 0.587, 0.114));
    float tc = dot(texture(inputTexture, TexCoord + vec2( 0, -1) * t).rgb, vec3(0.299, 0.587, 0.114));
    float tr = dot(texture(inputTexture, TexCoord + vec2( 1, -1) * t).rgb, vec3(0.299, 0.587, 0.114));
    float ml = dot(texture(inputTexture, TexCoord + vec2(-1,  0) * t).rgb, vec3(0.299, 0.587, 0.114));
    float mr = dot(texture(inputTexture, TexCoord + vec2( 1,  0) * t).rgb, vec3(0.299, 0.587, 0.114));
    float bl = dot(texture(inputTexture, TexCoord + vec2(-1,  1) * t).rgb, vec3(0.299, 0.587, 0.114));
    float bc = dot(texture(inputTexture, TexCoord + vec2( 0,  1) * t).rgb, vec3(0.299, 0.587, 0.114));
    float br = dot(texture(inputTexture, TexCoord + vec2( 1,  1) * t).rgb, vec3(0.299, 0.587, 0.114));

    // Sobel gradients
    float ix = -tl + tr - 2.0*ml + 2.0*mr - bl + br;
    float iy = -tl - 2.0*tc - tr + bl + 2.0*bc + br;

    // Structure tensor components
    FragColor = vec4(ix * ix, iy * iy, ix * iy, length(vec2(ix, iy)));
}
