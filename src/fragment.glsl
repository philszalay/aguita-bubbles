/*fragment.glsl*/
uniform vec3 uColor;
uniform vec2 uResolution;
uniform float uPos;

varying vec2 vUv;
varying float opacity;

void main() {

 	vec2 uv = vUv;

	vec2 dist = gl_FragCoord.xy / uResolution;
	vec3 cc = vec3(0.0, dist.x, dist.y);

	///////////////////////////////////////////////////////////////////////////////////////
	// 出力
	vec3 balck = vec3(0.0,0.0,0.0);
	vec3 color = mix(balck, cc, opacity);
	gl_FragColor = vec4(color, 1.0);
}