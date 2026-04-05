#version 410 core

in vec2 TexCoord;
out vec4 FragColor;

uniform sampler2D inputTexture;
uniform vec2 resolution;

// Pointillist — breaks the image into small irregular color patches
// using Voronoi tessellation. No borders — just fractured color.
// At small cell sizes this creates a Monet/Seurat dappled light effect.

const float CELL_SIZE = 5.0;

vec2 hash2(vec2 p) {
    p = vec2(dot(p, vec2(127.1, 311.7)),
             dot(p, vec2(269.5, 183.3)));
    return fract(sin(p) * 43758.5453123);
}

void main() {
    vec2 pixelCoord = TexCoord * resolution / CELL_SIZE;
    vec2 cellBase = floor(pixelCoord);

    float minDist = 1e10;
    vec2 nearestCenter = vec2(0.0);

    for (int dy = -1; dy <= 1; dy++) {
        for (int dx = -1; dx <= 1; dx++) {
            vec2 neighbor = cellBase + vec2(float(dx), float(dy));
            vec2 point = neighbor + hash2(neighbor);
            float d = distance(pixelCoord, point);
            if (d < minDist) {
                minDist = d;
                nearestCenter = point;
            }
        }
    }

    // Sample color at cell center — no border darkening
    vec2 centerUV = nearestCenter * CELL_SIZE / resolution;
    vec3 color = texture(inputTexture, centerUV).rgb;

    FragColor = vec4(color, 1.0);
}
