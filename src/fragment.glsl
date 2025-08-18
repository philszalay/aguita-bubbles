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

uniform vec3 u_bubbleColor;

uniform float u_reflectionFactor;
uniform float u_transparency;
uniform float u_roughness;
uniform float u_saturation;
uniform float u_ambientOcclusionAttenuation;

#define PI 3.14159265359

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
		sca *= u_ambientOcclusionAttenuation;
	}
	return clamp(1.0 - 3.0 * occ, 0.0, 1.0);
}

// Approximate normal
vec3 normal(vec3 p) {
	vec3 e = vec3(u_eps, 0.0, 0.0);
	return normalize(vec3(scene(p + e.xyy) - scene(p - e.xyy), scene(p + e.yxy) - scene(p - e.yxy), scene(p + e.yyx) - scene(p - e.yyx)));
}

float fresnel(float cosTheta, float F0) {
	return F0 + (1.0 - F0) * pow(1.0 - cosTheta, 5.0);
}

vec3 sampleEnvMap(vec3 reflectDir, float roughness) {
	float lod = roughness; // Adjust this multiplier to control roughness effect
	return textureLod(u_envMap, reflectDir.xy * 0.5 + 0.5, lod).rgb;
}

// Sättigungsfunktion
vec3 adjustSaturation(vec3 color, float saturation) {
	float luminance = dot(color, vec3(0.299, 0.587, 0.114));
	return mix(vec3(luminance), color, saturation);
}

// Add this function
vec3 refract2(vec3 incident, vec3 normal, float eta) {
	float cosI = -dot(normal, incident);
	float sinT2 = eta * eta * (1.0 - cosI * cosI);
	if(sinT2 > 1.0)
		return vec3(0.0); // Total internal reflection
	return eta * incident + (eta * cosI - sqrt(1.0 - sinT2)) * normal;
}

void main() {
	vec2 uv = vUv.xy;
	vec3 ro = u_camPos;
	vec3 rd = normalize((u_camInvProjMat * vec4(uv * 2. - 1., 0, 1)).xyz);
	rd = (u_camToWorldMat * vec4(rd, 0)).xyz;

	vec3 backgroundColor = texture(u_backgroundTexture, uv).rgb;
	float dist = rayMarch(ro, rd);

	if(dist >= u_maxDis) {
		gl_FragColor = vec4(backgroundColor, 1.0);
		return;
	}

	vec3 hitPos = ro + dist * rd;
	vec3 n = normal(hitPos);

    // Glass properties
	float ior = 1.5; // Index of refraction for glass
	float eta = 1.0 / ior; // Air to glass ratio

    // Calculate reflection and refraction directions
	vec3 reflectDir = reflect(rd, n);
	vec3 refractDir = refract2(rd, n, eta);

    // Fresnel effect (stronger for glass)
	float F0 = pow((1.0 - ior) / (1.0 + ior), 2.0);
	float fresnelFactor = fresnel(max(dot(-rd, n), 0.0), F0);

    // Sample environment for reflection
	vec3 reflectionColor = texture(u_envMap, reflectDir.xy * 0.5 + 0.5).rgb;

    // Sample background through refraction
	vec3 refractionColor = backgroundColor;
	if(length(refractDir) > 0.0) {
        // March through the glass to find exit point
		vec3 refractRo = hitPos + refractDir * u_eps * 2.0;
		float refractDist = rayMarch(refractRo, refractDir);

		if(refractDist < u_maxDis) {
			vec3 exitPos = refractRo + refractDist * refractDir;
			vec3 exitNormal = -normal(exitPos); // Flip normal for exit

            // Refract again when exiting glass
			vec3 finalRefractDir = refract2(refractDir, exitNormal, ior);
			if(length(finalRefractDir) > 0.0) {
                // Calculate distorted UV coordinates
				vec3 projectedPos = exitPos + finalRefractDir * 0.1;
				vec2 distortedUV = uv + (projectedPos.xy - hitPos.xy) * 0.1;
				distortedUV = clamp(distortedUV, 0.0, 1.0);
				refractionColor = texture(u_backgroundTexture, distortedUV).rgb;
			}
		}
	}

    // Mix reflection and refraction based on Fresnel
	vec3 glassColor = mix(refractionColor, reflectionColor, fresnelFactor);

    // Add slight tint (optional)
	vec3 glassTint = u_bubbleColor;
	glassColor = mix(glassColor, glassColor * glassTint, 0.1);

    // Apply transparency
	vec3 finalColor = mix(glassColor, backgroundColor, u_transparency);

    // Apply ambient occlusion (lighter for glass)
	float ao = ambientOcclusion(hitPos, n);
	ao = mix(1.0, ao, 0.3); // Reduce AO effect for glass
	finalColor *= ao;

	finalColor = adjustSaturation(finalColor, u_saturation);
	gl_FragColor = vec4(finalColor, 1.0);
}