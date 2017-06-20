precision highp float;

uniform mat4 u_projection;
uniform mat4 u_model;
uniform mat4 u_view;
uniform vec2 u_size;
attribute vec2 a_position;
attribute vec2 a_uv;
varying vec2 v_uv;

void main() {
	v_uv = a_uv;
  gl_Position = u_projection * u_view * u_model *
  	vec4(vec2(a_position * u_size * 0.5), 0.0, 1.0);
}
