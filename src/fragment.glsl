precision mediump float;

in vec2 vUv;

uniform sampler2D u_backgroundTexture;

uniform float u_eps;
uniform float u_maxDis;
uniform int u_maxSteps;

uniform vec3 u_camPos;
uniform mat4 u_camToWorldMat;
uniform mat4 u_camInvProjMat;

uniform float u_shininess;

uniform sampler2D u_sphereTexture;
uniform int u_numSpheres;
uniform float u_sphereKValues[158];

uniform float u_transparency;
uniform float u_refractiveIndex;

uniform sampler2D u_envMap;

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
	if(dist >= u_maxDis) {
        // Ray didn't hit any object, use background image
		vec3 backgroundColor = texture(u_backgroundTexture, uv).rgb;
		gl_FragColor = vec4(backgroundColor, 1.0);
	} else {
		vec3 hitPos = ro + dist * rd;
		vec3 n = normal(hitPos);

        // Reflection and refraction
		vec3 reflectDir = reflect(rd, n);
		vec3 refractDir = refract(rd, n, 1.0 / u_refractiveIndex);

		vec2 distortion = refractDir.xy * (1.0 - u_transparency) * 0.02; // Adjust the 0.1 to control distortion strength

        // Sample HDRI for reflection and refraction colors
		vec3 reflectColor = texture(u_envMap, reflectDir.xy * 0.5 + 0.5).rgb;

		// Sample background image with distortion
		vec2 distortedUV = uv + distortion;
		
		vec3 backgroundColor = texture(u_backgroundTexture, distortedUV).rgb;

		vec3 refractColor = texture(u_envMap, refractDir.xy * 0.5 + 0.5).rgb;

        // Mix reflection and refraction colors
		vec3 glassColor = mix(backgroundColor, reflectColor, 0.8);

        // Sample background image

		// vec2 a = vec2(vUv.y, vUv.x);

        // Blend glass color with background color based on transparency
		vec3 finalColor = mix(glassColor, backgroundColor, u_transparency);

        // Set final color with full opacity
		gl_FragColor = vec4(finalColor, 1.0);
	}
}
