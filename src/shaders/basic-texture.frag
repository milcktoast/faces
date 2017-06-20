precision mediump float;
uniform sampler2D u_color;
uniform vec2 u_repeat;
varying vec2 v_uv;

void main() {
  gl_FragColor = texture2D(u_color, mod(v_uv * u_repeat, 1.0));
}
