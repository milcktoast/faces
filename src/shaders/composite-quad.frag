precision highp float;

uniform sampler2D u_texture;
uniform float u_opacity;
varying vec2 v_uv;

void main() {
  float feather = 1.0 - smoothstep(0.1, 0.25, pow(distance(v_uv, vec2(0.5)), 3.0));
  gl_FragColor = vec4(texture2D(u_texture, v_uv).rgb, u_opacity * feather);
}
