precision mediump float;
uniform sampler2D color;
uniform vec2 repeat;
varying vec2 uv;

void main() {
  gl_FragColor = texture2D(color, mod(uv * repeat, 1.0));
}
