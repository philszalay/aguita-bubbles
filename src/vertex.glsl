/*vertex.glsl*/
uniform vec3 viewVector;// CameraPosition
uniform vec2 uResolution;
varying vec2 vUv;
varying float opacity;

void main() {
    vUv=uv;
    vec4 modelPosition = modelMatrix * vec4(position, 1.0);
    vec4 viewPosition = viewMatrix * modelPosition;
    vec4 projectionPosition = projectionMatrix * viewPosition;
    gl_Position = projectionPosition;

    vec3 nNomal = normalize(normal);
    vec3 nViewVec = normalize(viewVector);
    opacity = dot(nNomal, nViewVec);
    opacity = 1.0 - abs(opacity*1.3);
}