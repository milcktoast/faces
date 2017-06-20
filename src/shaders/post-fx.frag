precision mediump float;

#pragma glslify: blend = require(glsl-blend/all)

uniform sampler2D u_color;
uniform sampler2D u_background;
uniform int u_blendMode;
uniform float u_blendOpacity;
varying vec2 v_uv;

void main() {
  vec3 color = texture2D(u_color, v_uv).rgb;
  vec3 background = texture2D(u_background, v_uv).rgb;
  gl_FragColor = vec4(blend(u_blendMode, background, color, u_blendOpacity), 1.0);
}
