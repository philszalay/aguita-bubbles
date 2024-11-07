precision mediump float;

// From vertex shader
in vec2 vUv;

// From CPU
uniform vec3 u_clearColor;

uniform float u_eps;
uniform float u_maxDis;
uniform int u_maxSteps;

uniform vec3 u_camPos;
uniform mat4 u_camToWorldMat;
uniform mat4 u_camInvProjMat;

uniform vec3 u_lightDir;
uniform vec3 u_lightColor;

uniform float u_diffIntensity;
uniform float u_specIntensity;
uniform float u_ambientIntensity;
uniform float u_shininess;

uniform sampler2D u_sphereTexture;
uniform int u_numSpheres;

float smin(float a, float b, float k) {
	float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
	return mix(b, a, h) - k * h * (1.0 - h);
}

float scene(vec3 p) {
	float minDistance = u_maxDis;
	for(int i = 0; i < u_numSpheres; i++) {
		vec4 sphereData = texture(u_sphereTexture, vec2(float(i) / float(u_numSpheres - 1), 0.0));
		// vec4 sphereData = vec4(0.0, 0.0, 0.0, 0.0);

		vec3 spherePos = sphereData.xyz;
		float sphereRadius = sphereData.w;

		float distanceToSphere = distance(p, spherePos) - sphereRadius;
		// float distanceToSphere = sqrt(distanceSquared(p, spherePos)) - sphereRadius;
		// float distanceToSphere = approxLength(p - spherePos) - sphereRadius;

		minDistance = smin(minDistance, distanceToSphere, 0.02);
	}

	return minDistance;
}

float approxLength(vec3 v) {
    float ax = abs(v.x), ay = abs(v.y), az = abs(v.z);
    float m = max(max(ax, ay), az);
    return m + (ax + ay + az - m) * 0.5; // Approximation
}

float distanceSquared(vec3 a, vec3 b) {
	vec3 diff = a - b;
	return dot(diff, diff); // squared distance, avoiding sqrt
}

float rayMarch(vec3 ro, vec3 rd) {
	float d = 0.; // total distance travelled
	float cd; // current scene distance
	vec3 p; // current position of ray

	for(int i = 0; i < u_maxSteps; ++i) { // main loop
		p = ro + d * rd; // calculate new position
		cd = scene(p); // get scene distance

        // if we have hit anything or our distance is too big, break loop
		if(cd < u_eps || d >= u_maxDis)
			break;

        // otherwise, add new scene distance to total distance
		d += cd;
	}

	return d; // finally, return scene distance
}

vec3 normal(vec3 p) // from https://iquilezles.org/articles/normalsSDF/
{
	vec3 n = vec3(0, 0, 0);
	vec3 e;
	for(int i = 0; i < 4; i++) {
		e = 0.5773 * (2.0 * vec3((((i + 3) >> 1) & 1), ((i >> 1) & 1), (i & 1)) - 1.0);
		n += e * scene(p + e * u_eps);
	}
	return normalize(n);
}

void main() {
    // Get UV from vertex shader
	vec2 uv = vUv.xy;

    // Get ray origin and direction from camera uniforms
	vec3 ro = u_camPos;
	vec3 rd = (u_camInvProjMat * vec4(uv * 2. - 1., 0, 1)).xyz;
	rd = (u_camToWorldMat * vec4(rd, 0)).xyz;
	rd = normalize(rd);

    // Ray marching and find total distance travelled
	float disTravelled = rayMarch(ro, rd); // use normalized ray

	if(disTravelled >= u_maxDis) { // if ray doesn't hit anything
		gl_FragColor = vec4(u_clearColor, 1);
	} else { // if ray hits something
        // Find the hit position
		vec3 hp = ro + disTravelled * rd;

        // Get normal of hit point
		vec3 n = normal(hp);

		// vec3 n = vec3(0, 0, 0);

        // Calculate Diffuse model
		float dotNL = dot(n, u_lightDir);
		float diff = max(dotNL, 0.0) * u_diffIntensity;
		float spec = pow(diff, u_shininess) * u_specIntensity;
		float ambient = u_ambientIntensity;

		vec3 red = vec3(1., 0., 0.);

		vec3 color = u_lightColor * (red * (spec + ambient + diff));
		gl_FragColor = vec4(color, 1); // color output
	}
}