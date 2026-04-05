#version 410 core

in vec2 TexCoord;
out vec4 FragColor;

uniform sampler2D inputTexture;    // smoothed structure tensor
uniform sampler2D originalTexture; // original frame
uniform vec2 resolution;

// Oil brush strokes — elongated Voronoi cells whose orientation
// follows the local edge direction from the structure tensor.
// Each cell is filled with the color sampled at its center.
// Near edges: cells stretch along the edge. In flat regions: rounder.

const float CELL_SIZE = 10.0;
const float MAX_ELONGATION = 3.0;

vec2 hash2(vec2 p) {
    p = vec2(dot(p, vec2(127.1, 311.7)),
             dot(p, vec2(269.5, 183.3)));
    return fract(sin(p) * 43758.5453123);
}

void main() {
    vec2 texelSize = 1.0 / resolution;
    vec2 pixelCoord = TexCoord * resolution / CELL_SIZE;
    vec2 cellBase = floor(pixelCoord);

    float minDist = 1e10;
    vec2 nearestCenter = vec2(0.0);

    for (int dy = -2; dy <= 2; dy++) {
        for (int dx = -2; dx <= 2; dx++) {
            vec2 neighbor = cellBase + vec2(float(dx), float(dy));
            vec2 point = neighbor + hash2(neighbor);

            // Sample structure tensor at this cell center
            vec2 centerUV = point * CELL_SIZE / resolution;
            vec4 st = texture(inputTexture, centerUV);
            float j00 = st.r;
            float j11 = st.g;
            float j01 = st.b;

            // Eigenvector: direction along edge (minor eigenvector)
            float trace = j00 + j11;
            float det = j00 * j11 - j01 * j01;
            float delta = max(0.0, trace * trace - 4.0 * det);
            float lambda1 = (trace + sqrt(delta)) * 0.5;
            float lambda2 = (trace - sqrt(delta)) * 0.5;

            // Edge direction
            vec2 edgeDir;
            if (abs(j01) > 0.0005) {
                edgeDir = normalize(vec2(-(lambda1 - j00), j01));
            } else {
                edgeDir = vec2(1.0, 0.0);
            }

            // Anisotropy drives elongation
            float aniso = (lambda1 - lambda2) / (lambda1 + lambda2 + 0.001);
            float elongation = 1.0 + aniso * (MAX_ELONGATION - 1.0);

            // Distance in elongated metric aligned to edge
            vec2 diff = pixelCoord - point;
            float u = dot(diff, edgeDir);           // along edge
            float v = dot(diff, vec2(-edgeDir.y, edgeDir.x)); // across edge
            float d = sqrt(u * u / (elongation * elongation) + v * v);

            if (d < minDist) {
                minDist = d;
                nearestCenter = point;
            }
        }
    }

    // Sample color from original image at cell center
    vec2 centerUV = nearestCenter * CELL_SIZE / resolution;
    vec3 color = texture(originalTexture, centerUV).rgb;

    FragColor = vec4(color, 1.0);
}
