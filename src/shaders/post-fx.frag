precision mediump float;

uniform sampler2D u_color;
varying vec2 v_uv;

void main() {
  vec3 color = texture2D(u_color, v_uv).rgb;
  gl_FragColor = vec4(color, 1.0);
}
