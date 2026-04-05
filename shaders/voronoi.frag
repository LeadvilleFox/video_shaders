#version 410 core

in vec2 TexCoord;
out vec4 FragColor;

uniform sampler2D inputTexture;
uniform vec2 resolution;

// Voronoi / stained glass — tessellates the image into irregular
// cells, fills each with the color sampled at the cell center.
// Optionally darkens cell borders for a stained-glass look.

const float CELL_SIZE = 9.0;  // approximate cell size in pixels
const float BORDER_WIDTH = 0.06; // border darkness (0 = no border)
const vec3 BORDER_COLOR = vec3(0.05, 0.04, 0.03);

vec2 hash2(vec2 p) {
    p = vec2(dot(p, vec2(127.1, 311.7)),
             dot(p, vec2(269.5, 183.3)));
    return fract(sin(p) * 43758.5453123);
}

void main() {
    vec2 pixelCoord = TexCoord * resolution / CELL_SIZE;
    vec2 cellBase = floor(pixelCoord);

    float minDist = 1e10;
    float secondDist = 1e10;
    vec2 nearestCenter = vec2(0.0);

    // Check 3x3 neighborhood of cells
    for (int dy = -1; dy <= 1; dy++) {
        for (int dx = -1; dx <= 1; dx++) {
            vec2 neighbor = cellBase + vec2(float(dx), float(dy));
            vec2 point = neighbor + hash2(neighbor); // jittered center

            float d = distance(pixelCoord, point);
            if (d < minDist) {
                secondDist = minDist;
                minDist = d;
                nearestCenter = point;
            } else if (d < secondDist) {
                secondDist = d;
            }
        }
    }

    // Sample color at the cell center
    vec2 centerUV = nearestCenter * CELL_SIZE / resolution;
    vec3 color = texture(inputTexture, centerUV).rgb;

    // Border: darken where two cells meet (distance to edge)
    float edgeDist = secondDist - minDist;
    float border = 1.0 - smoothstep(0.0, BORDER_WIDTH, edgeDist);
    color = mix(color, BORDER_COLOR, border);

    FragColor = vec4(color, 1.0);
}
