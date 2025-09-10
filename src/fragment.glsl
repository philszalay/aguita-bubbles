precision mediump float;

in vec2 vUv;

// Ray Marching
uniform float u_eps;
uniform float u_maxDis;
uniform int u_maxSteps;

// Camera
uniform vec3 u_camPos;
uniform mat4 u_camToWorldMat;
uniform mat4 u_camInvProjMat;

// Spheres
uniform int u_numSpheres;
uniform float u_sphereKValues[158];
uniform sampler2D u_sphereTexture;

// Background textures and environment
uniform sampler2D u_backgroundTexture1;
uniform sampler2D u_backgroundTexture2;
uniform sampler2D u_envMap;

// Simple glass properties
uniform float u_transparency;
uniform float u_reflectionReflectionFactor;
uniform float u_refractionFactor;
uniform float u_roughness;

// Smooth minimum function for metaballs
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
	float d = 0.0;
	for(int i = 0; i < u_maxSteps; ++i) {
		vec3 p = ro + d * rd;
		float dist = scene(p);
		if(dist < u_eps || d >= u_maxDis)
			break;
		d += dist;
	}
	return d;
}

// Calculate normal using finite differences
vec3 normal(vec3 p) {
	vec3 e = vec3(u_eps, 0.0, 0.0);
	return normalize(vec3(
		scene(p + e.xyy) - scene(p - e.xyy),
		scene(p + e.yxy) - scene(p - e.yxy),
		scene(p + e.yyx) - scene(p - e.yyx)
	));
}

void main() {
	vec2 uv = vUv.xy;
	
	// Setup ray
	vec3 ro = u_camPos;
	vec3 rd = normalize((u_camInvProjMat * vec4(uv * 2.0 - 1.0, 0.0, 1.0)).xyz);
	rd = (u_camToWorldMat * vec4(rd, 0.0)).xyz;

	// Sample background textures
	vec3 backgroundColor1 = texture(u_backgroundTexture1, uv).rgb;
	vec3 backgroundColor2 = texture(u_backgroundTexture2, uv).rgb;

	// Ray march
	float dist = rayMarch(ro, rd);

	// Background color
	if(dist >= u_maxDis) {
		gl_FragColor = vec4(backgroundColor1, 1.0);
		return;
	}

	// Hit point and normal
	vec3 hitPos = ro + dist * rd;
	vec3 n = normal(hitPos);

	// Simple glass effect
	vec3 reflectDir = reflect(rd, n);

	// Add roughness using fresnel-based approach
	if(u_roughness > 0.0) {
		// Use view angle to modulate roughness effect
		float viewAngle = abs(dot(-rd, n));
		float roughnessFactor = u_roughness * (1.0 - viewAngle * 0.5);
		
		// Smooth perturbation based on surface curvature
		vec3 perturbation = n * roughnessFactor * 0.1;
		reflectDir = normalize(mix(reflectDir, reflectDir + perturbation, roughnessFactor));
	}
	
	// Sample environment map for reflection
	vec3 reflectionColor = texture(u_envMap, reflectDir.xy * 0.5 + 0.5).rgb;
	
	// Calculate refraction direction
	vec3 refractDir = refract(rd, n, 1.0 / 1.4); // Air to water (IOR ~1.4)
	
	// Add subtle roughness to refraction
	if(u_roughness > 0.0 && length(refractDir) > 0.0) {
		float viewAngle = abs(dot(-rd, n));
		float refractionRoughness = u_roughness * 0.3 * (1.0 - viewAngle);
		vec3 perturbation = n * refractionRoughness * 0.05;
		refractDir = normalize(mix(refractDir, refractDir + perturbation, refractionRoughness));
	}
	
	// Sample background with refracted direction
	vec2 refractedUV = uv;
	
	if(length(refractDir) > 0.0) {
		// Project refracted ray to get distorted UV coordinates
		refractedUV = uv + refractDir.xy * 0.15 * u_refractionFactor;
		refractedUV = clamp(refractedUV, 0.0, 1.0);
	}

	vec3 refractionColor = texture(u_backgroundTexture2, refractedUV).rgb;
	
	// Simple fresnel approximation
	float fresnel = pow(1.0 - max(dot(-rd, n), 0.0), 3.0);
	
	// Mix reflection and refraction
	vec3 glassColor = mix(refractionColor, reflectionColor, fresnel * u_reflectionReflectionFactor);
	
	// Apply transparency
	vec3 finalColor = mix(glassColor, backgroundColor2, u_transparency);
	
	gl_FragColor = vec4(finalColor, 1.0);
}