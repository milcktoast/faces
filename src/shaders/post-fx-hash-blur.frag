precision mediump float;

uniform sampler2D u_color;
uniform float u_blurRadius;
uniform vec2 u_blurCenter;
uniform float u_offset;
uniform vec2 u_resolution;

uniform sampler2D u_background;
uniform int u_blendMode;
uniform float u_blendOpacity;

uniform vec3 u_vignetteColor;

varying vec2 v_uv;

#define ITERATIONS 32

vec3 sampleColor(vec2 uv);
#pragma glslify: hashBlur = require(glsl-hash-blur, sample = sampleColor, iterations = ITERATIONS)
#pragma glslify: blend = require(glsl-blend/all)

vec3 sampleColor(vec2 uv) {
  vec3 color = texture2D(u_color, uv).rgb;
  vec3 background = texture2D(u_background, uv).rgb;
  return blend(u_blendMode, background, color, u_blendOpacity);
}

void main() {
  float aspect = u_resolution.x / u_resolution.y;
  float rad = distance(v_uv, u_blurCenter);

  float feather = smoothstep(0.0, 0.8, pow(rad, 2.0));
  float sampleFactor = smoothstep(0.0, 1.0, rad);
  float sampleRadius = sampleFactor * (u_blurRadius / u_resolution.x);

  vec3 color = hashBlur(v_uv, sampleRadius, aspect, u_offset);
  gl_FragColor = vec4(mix(color, u_vignetteColor, feather), 1.0);
}
