# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Install dependencies
npm install

# Start dev server at localhost:8080
npm run dev

# Build for production (outputs to dist/)
npm run build

# Build for GitHub Pages deployment
npm run buildForGithub

# Deploy dist/ to gh-pages branch
npm run deploy
```

No test runner is configured.

## Architecture

This is a Three.js metaball animation built as a Webpack-bundled web application. The core is a ray-marching renderer that renders physics-simulated metaballs using custom GLSL shaders.

### Core entry point: `src/script.js`

The main class `ThreeJsDraft` orchestrates everything:

1. **Physics (Rapier3D)**: Two types of physics bodies are created via `initRapier()`:
   - **Text balls** (`getTextBall`): Small spheres whose gravitation centers are loaded from `src/logoCoordinates.txt` — a list of `radius,x,y,z` coordinates that form a logo shape. They float toward their assigned positions.
   - **Mouse balls** (`getBall`): 10 larger spheres that follow the mouse cursor using exponential distance falloff.

2. **Rendering**: A fullscreen `PlaneGeometry` with a `ShaderMaterial` covers the near plane of the camera. Each frame, sphere positions are packed into a `THREE.DataTexture` (RGBA Float32) and uploaded to the GPU.

3. **Shaders** (`src/vertex.glsl`, `src/fragment.glsl`): The fragment shader does ray marching using smooth-min (`smin`) to blend all spheres into a liquid metaball effect. It computes glass-like shading with Fresnel, reflection (env map), and refraction (distorted UV from background video texture).

4. **Backgrounds**: Two `<video>` elements are expected in the DOM before init. They become `VideoTexture`s — one for the background, one for refraction inside the metaballs.

5. **Overlay buttons**: Transparent absolute-positioned `<button>` elements are placed over the canvas, sized relative to canvas dimensions and repositioned on resize. Defined in `initializeButtons()`.

### Dev flags in `ThreeJsDraft`

- `this.debug = false` — when `true`, adds visible debug meshes for all spheres instead of rendering the ray march plane
- `this.localDev = false` — when `true`, loads HDR from local file (instead of CDN), shows dat.GUI controls, and shows Stats overlay

To use local dev mode, set both flags to `true` in the constructor.

### Custom Code / Injections

- `Custom Code/` — HTML snippets for injection into a CMS (Webflow). Contains per-page scripts and a main `landing.html` with the bundled script embedded inline.
- `injections/` — Additional HTML injection files for specific CMS pages (archive, commercial, directors, music video, etc.), including store page and UE page injections.

The `dist/` output is also committed and used directly — `Custom Code/landing.html` embeds the compiled bundle inline for CMS deployment.

### Webpack config

Split across `bundler/webpack.common.js`, `webpack.dev.js`, `webpack.prod.js`. Key loaders:
- `.glsl` files → `raw-loader` (imported as strings)
- `.txt` files → `raw-loader` (used for logo coordinates)
- `.hdr` files → `file-loader`
- `.wasm` → async WebAssembly experiment (required for Rapier3D)

### Sphere data texture layout

The `DataTexture` has width = `numTextBalls + numMouseBalls`, height = 1, RGBA Float32. Text balls occupy indices `0..n-1` from the left; mouse balls are packed from the right end. This layout is mirrored in the fragment shader's `texture()` lookup using `float(i) / float(u_numSpheres - 1)`.
