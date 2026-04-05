#version 410 core

in vec2 TexCoord;
out vec4 FragColor;

uniform sampler2D inputTexture;
uniform vec2 resolution;

// Palette restriction — remaps every pixel to the nearest color
// from a curated hand-picked palette. Creates a very deliberate,
// illustrated look.
//
// Default palette: warm impressionist (Monet/Renoir inspired).
// Change the palette array for completely different moods.

const int NUM_COLORS = 12;
const vec3 PALETTE[12] = vec3[](
    vec3(0.95, 0.92, 0.85),  // warm white
    vec3(0.85, 0.75, 0.55),  // golden ochre
    vec3(0.70, 0.50, 0.30),  // burnt sienna
    vec3(0.45, 0.30, 0.20),  // dark umber
    vec3(0.20, 0.15, 0.10),  // near black
    vec3(0.55, 0.65, 0.50),  // sage green
    vec3(0.35, 0.50, 0.40),  // forest green
    vec3(0.50, 0.60, 0.75),  // steel blue
    vec3(0.35, 0.40, 0.60),  // slate blue
    vec3(0.80, 0.55, 0.45),  // terracotta
    vec3(0.75, 0.40, 0.35),  // dusty red
    vec3(0.90, 0.80, 0.60)   // warm sand
);

void main() {
    vec3 color = texture(inputTexture, TexCoord).rgb;

    // Find nearest palette color (Euclidean distance in RGB)
    float minDist = 1e10;
    vec3 nearest = color;

    for (int i = 0; i < NUM_COLORS; i++) {
        vec3 diff = color - PALETTE[i];
        float d = dot(diff, diff);
        if (d < minDist) {
            minDist = d;
            nearest = PALETTE[i];
        }
    }

    // Soft blend — enough to see the palette but not obliterate the original
    color = mix(color, nearest, 0.65);

    FragColor = vec4(color, 1.0);
}
