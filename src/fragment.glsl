precision mediump float;

in vec2 vUv;

uniform float u_eps;
uniform float u_maxDis;
uniform int u_maxSteps;
uniform vec3 u_camPos;
uniform mat4 u_camToWorldMat;
uniform mat4 u_camInvProjMat;
uniform int u_numSpheres;
uniform float u_sphereKValues[158];
uniform sampler2D u_sphereTexture;
uniform sampler2D u_envMap;
uniform sampler2D u_backgroundTexture;

uniform vec3 u_mainColor;

uniform float u_reflectionFactor;
uniform float u_transparency;
uniform float u_roughness;

// Smooth minimum function
float smin(float a, float b, float k) {
	float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
	return mix(b, a, h) - k * h * (1.0 - h);
}

// Scene function for spheres
float scene(vec3 p) {
	float minDistance = 1e10;

	for(int i = 0; i < u_numSpheres; i++) {
		vec4 sphereData = texture(u_sphereTexture, vec2(float(i) / float(u_numSpheres - 1), 0.0));
		vec3 spherePos = sphereData.xyz;
		float sphereRadius = sphereData.w;
		float distanceToSphere = distance(p, spherePos) - sphereRadius;
		float k = u_sphereKValues[i];
		minDistance = smin(minDistance, distanceToSphere, k);
	}

	return minDistance;
}

// Ray marching function
float rayMarch(vec3 ro, vec3 rd) {
	float d = 0.;
	for(int i = 0; i < u_maxSteps; ++i) {
		vec3 p = ro + d * rd;
		float dist = scene(p);
		if(dist < u_eps || d >= u_maxDis)
			break;
		d += dist;
	}
	return d;
}

float ambientOcclusion(vec3 p, vec3 n) {
	float occ = 0.0;
	float sca = 1.0;
	for(int i = 0; i < 5; i++) {
		float h = 0.01 + 0.12 * float(i) / 4.0;
		float d = scene(p + h * n);
		occ += (h - d) * sca;
		sca *= 0.95;
	}
	return clamp(1.0 - 3.0 * occ, 0.0, 1.0);
}

// Approximate normal
vec3 normal(vec3 p) {
	vec3 e = vec3(u_eps, 0.0, 0.0);
	return normalize(vec3(scene(p + e.xyy) - scene(p - e.xyy), scene(p + e.yxy) - scene(p - e.yxy), scene(p + e.yyx) - scene(p - e.yyx)));
}

void main() {

	vec2 uv = vUv.xy;
	vec3 ro = u_camPos;
	vec3 rd = normalize((u_camInvProjMat * vec4(uv * 2. - 1., 0, 1)).xyz);
	rd = (u_camToWorldMat * vec4(rd, 0)).xyz;

    // Ray marching to determine hit point
	float dist = rayMarch(ro, rd);

    // Colors

	// Don't use texture for now	
	//vec3 backgroundColor = texture(u_backgroundTexture, uv).rgb;

	vec3 backgroundColor = vec3(0.0, 0.0, 0.0);

	if(dist >= u_maxDis) {
        // Ray didn't hit any object, use background image
		gl_FragColor = vec4(backgroundColor, 1.0);
	} else {
		vec3 hitPos = ro + dist * rd;
		vec3 n = normal(hitPos);

        // Calculate ambient occlusion
		float ao = ambientOcclusion(hitPos, n);

        // Reflection and refraction
		vec3 reflectDir = reflect(rd, n);

        // Sample HDRI for reflection and refraction colors
		vec3 reflectColor = texture(u_envMap, reflectDir.xy * 0.5 + 0.5).rgb;

        // Darken the main color based on transparency
		vec3 darkenedMainColor = u_mainColor * (1.0 - u_transparency * 0.5);

        // Blending
		vec3 finalColor = mix(darkenedMainColor, reflectColor, u_reflectionFactor);
		finalColor = mix(finalColor, backgroundColor, u_transparency);

        // Apply ambient occlusion
		finalColor *= ao;

		gl_FragColor = vec4(finalColor, 1.0);
	}
}
