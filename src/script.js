/* eslint-disable semi */
/* eslint-disable space-before-function-paren */
import './style.css'
import * as THREE from 'three'
import Stats from 'three/examples/jsm/libs/stats.module'
import Vertex from './vertex.glsl'
import Fragment from './fragment.glsl'
import logoCoordinates from './logoCoordinates.txt'
import RAPIER from '@dimforge/rapier3d-compat';
import { GUI } from 'dat.gui'
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
import hdr from './main.hdr';

const TARGET_ASPECT_RATIO = 1920 / 1080;

export default class ThreeJsDraft {
  constructor(canvas) {
    /**
     * Variables
    */
    this.canvas = canvas;
    this.overlayButtons = [];

    this.debug = false
    this.localDev = true;

    // get first to video elements of page
    const videos = document.querySelectorAll('video');
    this.videoElement1 = videos[0];
    this.videoElement2 = videos[1];

    if (this.localDev) {
      this.videoElement1.setAttribute('crossorigin', 'anonymous');
      this.videoElement2.setAttribute('crossorigin', 'anonymous');

      this.videoElement1.load();
      this.videoElement2.load();

      this.videoElement1.play();
      this.videoElement2.play();
    }

    // start video from beginning
    this.videoElement1.currentTime = 0;
    this.videoElement2.currentTime = 0;

    /**
     * Scene
     */
    this.scene = new THREE.Scene()

    /**
     * Mouse
     */
    this.mouseX = 0
    this.mouseY = 0
    this.mousePosition = new THREE.Vector3(0, 0, 0)

    /**
     * Camera
     */
    this.camera = new THREE.PerspectiveCamera(75, this.canvas.width / this.canvas.height, 0.1, 10)
    this.camera.position.z = 0.75

    /**
     * Renderer
     */
    this.renderTarget = new THREE.WebGLRenderTarget(this.canvas.width, this.canvas.height);

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas
    });

    this.framesPerSecond = 30;
    this.lastFrameTime = Date.now();

    this.renderer.setSize(this.canvas.width, this.canvas.height)

    /**
      * Rapier
      */
    this.initRapier()
    this.numBalls = 10;
    this.balls = []
    this.textBalls = []

    this.radiusValues = {
      textSpheresRadius: { value: 0.025 },
      ballSpheresRadius: { value: 0.13 }
    }

    this.physicsParams = {
      dampingMultiplier: 150000,
      baseForceMagnitude: 0.0001,
      baseDamping: 15,
      baseForce: 0.01
    }

    /**
     * Resize function
     */
    this.resizeCanvas = () => {
      // Calculate the maximum size that fits in the window while maintaining 16:9 aspect ratio
      let width = window.innerWidth;
      let height = window.innerHeight;

      if (width / height > TARGET_ASPECT_RATIO) {
        // Window is wider than target ratio, constrain by height
        width = height * TARGET_ASPECT_RATIO;
      } else {
        // Window is taller than target ratio, constrain by width
        height = width / TARGET_ASPECT_RATIO;
      }

      // Update canvas size
      this.canvas.width = width;
      this.canvas.height = height;

      // Update camera
      this.camera.aspect = width / height;
      this.camera.updateProjectionMatrix();

      // Update renderer
      this.renderer.setSize(width, height);

      // Update render target
      this.renderTarget.setSize(width, height);

      // Update any other size-dependent components
      this.setRayMarchPlaneScale();
    };

    /**
     * Resize event listener
     */
    window.addEventListener('resize', () => {
      this.resizeCanvas.bind(this)();
      this.positionAllButtons();
    }, false);

    this.canvas.addEventListener('mousemove', (event) => {
      this.mouseX = event.clientX
      this.mouseY = event.clientY

      const mousePosition = new THREE.Vector3(
        (this.mouseX / window.innerWidth) * 2 - 1,
        -(this.mouseY / window.innerHeight) * 2 + 1,
        0
      );

      mousePosition.unproject(this.camera);
      const dir = mousePosition.sub(this.camera.position).normalize();
      const distance = -this.camera.position.z / dir.z;
      this.mousePosition = this.camera.position.clone().add(dir.multiplyScalar(distance));
    })

    /**
     * Loading Manager
     */
    this.loadingManager = new THREE.LoadingManager()

    this.loadingManager.onStart = function (url, itemsLoaded, itemsTotal) {
      console.log('Started loading file: ' + url + '.\nLoaded ' + itemsLoaded + ' of ' + itemsTotal + ' files.')
    }

    this.loadingManager.onLoad = function () {
      console.log('Loading complete!')
    }

    this.loadingManager.onProgress = function (url, itemsLoaded, itemsTotal) {
      console.log('Loading file: ' + url + '.\nLoaded ' + itemsLoaded + ' of ' + itemsTotal + ' files.')
    }

    this.loadingManager.onError = function (url) {
      console.log('There was an error loading ' + url)
    }
  }

  async initRapier() {
    await RAPIER.init();
    const gravity = { x: 0, y: 0, z: 0 };
    this.world = new RAPIER.World(gravity);

    /**
     * Load Assets
     */
    this.loadAssets()
  }

  getTextBall(gravitationCenter, radius) {
    // Adjust density inversely proportional to radius
    const density = radius;

    // Adjust damping based on radius (smaller balls have less damping)
    const damping = radius * this.physicsParams.dampingMultiplier;

    const initialPosition = gravitationCenter;

    const rigidBodyDesc = RAPIER.RigidBodyDesc.dynamic()
      .setLinearDamping(damping)
      .setTranslation(initialPosition.x, initialPosition.y, initialPosition.z)
      .setLinvel(0, 0, 0); // Set initial linear velocity to zero

    const rigid = this.world.createRigidBody(rigidBodyDesc);

    const colliderDesc = RAPIER.ColliderDesc.ball(radius)
      .setDensity(density)
      .setCollisionGroups(0b01 | (0b10 << 16));

    this.world.createCollider(colliderDesc, rigid);

    // Ball geometry and material
    const geometry = new THREE.IcosahedronGeometry(radius, 1);
    const material = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      flatShading: true
    });

    const mesh = new THREE.Mesh(geometry, material);

    const wireMat = new THREE.MeshBasicMaterial({
      color: 0x990000,
      wireframe: true
    });

    const wireMesh = new THREE.Mesh(geometry, wireMat);

    wireMesh.scale.setScalar(1.01);
    mesh.add(wireMesh);

    function update() {
      rigid.resetForces(true);

      // Update damping based on current GUI value
      const currentDamping = radius * this.physicsParams.dampingMultiplier;
      rigid.setLinearDamping(currentDamping);

      const { x, y, z } = rigid.translation();

      const pos = new THREE.Vector3(x, y, z);

      const dir = gravitationCenter.clone().sub(pos);

      const forceMagnitude = this.physicsParams.baseForceMagnitude * radius;

      const force = dir.normalize().multiplyScalar(forceMagnitude);
      rigid.addForce(force, true);

      mesh.position.set(x, y, z);

      return { pos, radius };
    }

    return { mesh, rigid, update: update.bind(this) };
  }

  getBall() {
    const minSize = 0.03;
    const maxSize = 0.05;
    const size = minSize + Math.random() * (maxSize - minSize);

    const density = size;

    // physics
    const rigidBodyDesc = RAPIER.RigidBodyDesc.dynamic();

    const rigid = this.world.createRigidBody(rigidBodyDesc);

    const colliderDesc = RAPIER.ColliderDesc.ball(size)
      .setDensity(density)
      .setCollisionGroups(0b10 | ((0b01 | 0b10) << 16)); // Group 0b10, collides with 0b01 and 0b10

    this.world.createCollider(colliderDesc, rigid);

    // Ball geometry and material
    const geometry = new THREE.IcosahedronGeometry(size, 1);
    const material = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      flatShading: true
    });

    const mesh = new THREE.Mesh(geometry, material);

    const wireMat = new THREE.MeshBasicMaterial({
      color: 0x990000,
      wireframe: true
    });

    const wireMesh = new THREE.Mesh(geometry, wireMat);
    wireMesh.scale.setScalar(1.01);
    mesh.add(wireMesh);

    function update() {
      rigid.resetForces(true);

      const { x, y, z } = rigid.translation();

      // Set gravitation center to mouse position
      const pos = new THREE.Vector3(x, y, z);

      const dir = this.mousePosition.clone().sub(pos);

      const distance = dir.length(); // Calculate the distance

      const gravitationFieldFactor = Math.exp(-distance);

      if (gravitationFieldFactor < 0.05) {
        gravitationFieldFactor = 0;
      }

      const forceValue = gravitationFieldFactor * this.physicsParams.baseForce * size;

      rigid.setLinearDamping(this.physicsParams.baseDamping);

      // Apply force based on direction and falloff (scaled force)
      const force = dir.normalize().multiplyScalar(forceValue); // Adjust the base force as needed
      rigid.addForce(force, true); // Apply the force at the center of the body

      mesh.position.set(x, y, z);

      return { pos, size };
    }

    return { mesh, rigid, update: update.bind(this) };
  }

  setRayMarchPlaneScale() {
    // Get the wdith and height of the near plane
    const nearPlaneWidth = this.camera.near * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) * this.camera.aspect * 2;
    const nearPlaneHeight = nearPlaneWidth / this.camera.aspect;

    // Scale the ray marching plane
    this.rayMarchPlane.scale.set(nearPlaneWidth, nearPlaneHeight, 1);
  }

  loadAssets() {
    const pmremGenerator = new THREE.PMREMGenerator(this.renderer);
    pmremGenerator.compileEquirectangularShader();

    new RGBELoader(this.loadingManager)
      .setDataType(THREE.FloatType)
      .load(this.localDev ? hdr : 'https://cdn.jsdelivr.net/gh/philszalay/aguita-bubbles@master/src/main.hdr', (hdrEquirect) => {
        this.bgTexture1 = new THREE.VideoTexture(this.videoElement1);
        this.bgTexture2 = new THREE.VideoTexture(this.videoElement2);

        hdrEquirect = pmremGenerator.fromEquirectangular(hdrEquirect).texture;

        hdrEquirect.dispose(); // sparen
        pmremGenerator.dispose();

        this.createSphereTexture()

        // Create a ray marching plane
        const geometry = new THREE.PlaneGeometry();
        this.material = new THREE.ShaderMaterial();
        this.rayMarchPlane = new THREE.Mesh(geometry, this.material)

        this.setRayMarchPlaneScale();

        this.uniforms = {
          u_eps: { value: 0.001 },
          u_maxDis: { value: 2 },
          u_maxSteps: { value: 500 },
          u_envMap: { value: hdrEquirect },
          u_camPos: { value: this.camera.position },
          u_camToWorldMat: { value: this.camera.matrixWorld },
          u_camInvProjMat: { value: this.camera.projectionMatrixInverse },
          u_sphereKValues: { value: this.sphereKValues },
          u_sphereTexture: { value: this.sphereTexture },
          u_numSpheres: { value: this.sphereCoordinates.length + this.numBalls },
          u_backgroundTexture1: { value: this.bgTexture1 },
          u_backgroundTexture2: { value: this.bgTexture2 },
          u_reflectionFactor: { value: 1 },
          u_reflectionReflectionFactor: { value: 1 },
          u_refractionFactor: { value: 0.5 },
          u_transparency: { value: 0 },
          u_saturation: { value: 1.6 }
        };

        if (this.localDev) {
          this.addHelpers()
        }

        // Set material properties
        this.material.uniforms = this.uniforms;
        this.material.vertexShader = Vertex;
        this.material.fragmentShader = Fragment;

        if (!this.debug) {
          this.scene.add(this.rayMarchPlane);
        }

        this.VECTOR3ZERO = new THREE.Vector3(0, 0, 0);
        this.cameraForwardPos = this.camera.position.clone().add(this.camera.getWorldDirection(this.VECTOR3ZERO).multiplyScalar(this.camera.near));

        this.rayMarchPlane.position.copy(this.cameraForwardPos);

        /**
         * Animation Loop
         */
        setInterval(this.animate.bind(this), 1000 / this.framesPerSecond);

        // Initialize overlay buttons
        this.initializeButtons();
      });
  }

  /**
   * Add overlay button with custom title and position
   */
  addOverlayButton(x, y, page) {
    // Create button element
    const button = document.createElement('button');
    button.className = 'overlay-button';

    // Apply styles
    Object.assign(button.style, {
      position: 'absolute',
      background: 'rgba(255, 255, 255, 0.9)',
      border: '2px solid #333',
      borderRadius: '8px',
      padding: '12px 24px',
      fontFamily: 'Arial, sans-serif',
      fontSize: '16px',
      fontWeight: 'bold',
      color: '#333',
      cursor: 'pointer',
      zIndex: '10000',
      transition: 'all 0.3s ease',
      backdropFilter: 'blur(5px)'
    });

    // Add click handler to navigate to page
    if (page) {
      button.addEventListener('click', () => {
        window.location.href = '/' + page;
      });
    }

    // Store button data
    const buttonData = {
      element: button,
      x: x, // percentage from left (0.0 to 1.0)
      y: y, // percentage from top (0.0 to 1.0)
    };

    this.overlayButtons.push(buttonData);
    document.body.appendChild(button);

    // Position the button
    this.positionButton(buttonData);

    return buttonData;
  }

  /**
   * Position a single button based on canvas dimensions
   */
  positionButton(buttonData) {
    const canvasRect = this.canvas.getBoundingClientRect();

    const buttonX = canvasRect.left + (canvasRect.width * buttonData.x);
    const buttonY = canvasRect.top + (canvasRect.height * buttonData.y);

    buttonData.element.style.left = buttonX + 'px';
    buttonData.element.style.top = buttonY + 'px';
    buttonData.element.style.transform = 'translate(-50%, -50%)';
  }

  /**
   * Position all buttons (called on resize)
   */
  positionAllButtons() {
    this.overlayButtons.forEach(buttonData => {
      this.positionButton(buttonData);
    });
  }

  /**
   * Initialize buttons - add your buttons here
   */
  initializeButtons() {
    // Example buttons - customize these as needed
    this.addOverlayButton(0.75, 0.25, 'music-video');
    this.addOverlayButton(0.25, 0.75, 'archive');
    this.addOverlayButton(0.25, 0.55, 'art');
    this.addOverlayButton(0.75, 0.75, 'store');
    this.addOverlayButton(0.55, 0.75, 'info');
    this.addOverlayButton(0.05, 0.75, 'commercial');
    this.addOverlayButton(0.25, 0.15, 'stills');
  }

  addHelpers() {
    const axisHelper = new THREE.AxesHelper(3)
    this.scene.add(axisHelper)

    // use dat ui
    const gui = new GUI()

    const onChange = () => {
      for (let i = 0; i < this.sphereCoordinates.length; i++) {
        this.sphereKValues[i] = this.radiusValues.textSpheresRadius.value;
      }

      for (let i = 0; i < this.balls.length; i++) {
        this.sphereKValues[i + this.sphereCoordinates.length] = this.radiusValues.ballSpheresRadius.value;
      }
    }

    gui.add(this.radiusValues.textSpheresRadius, 'value', 0.005, 0.05).step(0.005).name('Logo Balls Radius').onChange(onChange)
    gui.add(this.radiusValues.ballSpheresRadius, 'value', 0.05, 0.2).step(0.01).name('Mouse Balls Radius').onChange(onChange)
    gui.add(this.uniforms.u_saturation, 'value', 0, 5).step(0.01).name('Saturation');
    gui.add(this.uniforms.u_transparency, 'value', 0, 1).step(0.01).name('Transparency');
    gui.add(this.uniforms.u_refractionFactor, 'value', 0, 1).step(0.01).name('Refraction Factor');
    gui.add(this.uniforms.u_reflectionReflectionFactor, 'value', 0, 3).step(0.01).name('Reflection Factor');

    // Physics parameters
    gui.add(this.physicsParams, 'dampingMultiplier', 10, 2000000).step(10).name('Damping ↓');
    gui.add(this.physicsParams, 'baseForceMagnitude', 0.00001, 0.0005).step(0.000001).name('Magnitude');
    gui.add(this.physicsParams, 'baseDamping', 1, 50).step(1).name('Base Damping');
    gui.add(this.physicsParams, 'baseForce', 0.0001, 0.05).step(0.0001).name('Mouse Force');

    this.stats = Stats()
    document.body.appendChild(this.stats.dom)
  }

  createSphereTexture() {
    this.sphereKValues = [];
    this.sphereCoordinates = logoCoordinates.split('\n').filter(line => line.trim() !== '');
    this.sphereData = new Float32Array(this.sphereCoordinates.length * 4 + this.numBalls * 4); // reserve for balls

    this.sphereCoordinates.forEach((line) => {
      const values = line.split(',').map(Number);
      const textBall = this.getTextBall(new THREE.Vector3(values[1], values[2], values[3]), values[0])

      if (this.debug) {
        this.scene.add(textBall.mesh);
      }

      this.textBalls.push(textBall);
      this.sphereKValues.push(this.radiusValues.textSpheresRadius.value);
    });

    for (let i = 0; i < this.numBalls; i++) {
      const body = this.getBall();
      this.balls.push(body);

      if (this.debug) {
        this.scene.add(body.mesh);
      }

      this.sphereKValues.push(this.radiusValues.ballSpheresRadius.value);
    };

    this.sphereTexture = new THREE.DataTexture(
      this.sphereData,
      this.sphereCoordinates.length + this.numBalls, // width (number of spheres)
      1, // height
      THREE.RGBAFormat,
      THREE.FloatType
    );
  }

  animate() {
    this.world.step();

    // Update texture with current balls position
    this.balls.forEach((ball, index) => {
      const { pos, size } = ball.update(index);
      this.sphereTexture.source.data.data[this.sphereTexture.source.data.data.length - (4 * index) - 4] = pos.x;
      this.sphereTexture.source.data.data[this.sphereTexture.source.data.data.length - (4 * index) - 3] = pos.y;
      this.sphereTexture.source.data.data[this.sphereTexture.source.data.data.length - (4 * index) - 2] = pos.z;
      this.sphereTexture.source.data.data[this.sphereTexture.source.data.data.length - (4 * index) - 1] = size;
    });

    this.textBalls.forEach((ball, index) => {
      const { pos, radius } = ball.update(index);
      this.sphereTexture.source.data.data[4 * index] = pos.x;
      this.sphereTexture.source.data.data[4 * index + 1] = pos.y;
      this.sphereTexture.source.data.data[4 * index + 2] = pos.z;
      this.sphereTexture.source.data.data[4 * index + 3] = radius;
    });

    this.sphereTexture.needsUpdate = true;

    if (this.localDev) {
      this.stats.update();
    }

    this.renderer.render(this.scene, this.camera);
  }
}

/**
 * Create ThreeJsDraft
 */
// eslint-disable-next-line no-new
function initBubbles() {
  // add a canvas element to the body
  const canvas = document.createElement('canvas');

  // Calculate the maximum size that fits in the window while maintaining 16:9 aspect ratio
  let width = window.innerWidth;
  let height = window.innerHeight;

  if (width / height > TARGET_ASPECT_RATIO) {
    // Window is wider than target ratio, constrain by height
    width = height * TARGET_ASPECT_RATIO;
  } else {
    // Window is taller than target ratio, constrain by width
    height = width / TARGET_ASPECT_RATIO;
  }

  canvas.width = width;
  canvas.height = height;
  canvas.id = 'bubbles';
  canvas.style.position = 'absolute';
  canvas.style.top = '50%';
  canvas.style.left = '50%';
  canvas.style.transform = 'translate(-50%, -50%)';
  canvas.style.zIndex = '9999';
  document.body.appendChild(canvas);
  document.body.style.overflow = 'hidden';

  if (canvas) {
    console.log('Initializing bubbles with canvas:', canvas);
    window.ThreeJsDraft = new ThreeJsDraft(canvas);
  } else {
    console.error('Canvas #bubbles not found');
  }
}

function checkVideosAndInit() {
  const videos = document.querySelectorAll('video');

  // If no videos found, check again after a delay
  if (!videos || videos.length === 0) {
    console.log('No videos found yet, checking again in 500ms');
    setTimeout(checkVideosAndInit, 50);
    return;
  }

  let loadedCount = 0;
  const totalVideos = videos.length;
  console.log(`Found ${totalVideos} videos, checking load status...`);

  // Function to check if all videos are loaded
  const checkAllLoaded = () => {
    loadedCount++;
    console.log(`Video loaded: ${loadedCount}/${totalVideos}`);
    if (loadedCount === totalVideos) {
      console.log('All videos loaded, initializing bubbles');
      initBubbles();
    }
  };

  // Add event listeners to all videos
  videos.forEach(video => {
    if (video.readyState >= 3) { // HAVE_FUTURE_DATA or higher
      checkAllLoaded();
    } else {
      video.addEventListener('canplay', checkAllLoaded, { once: true });

      // Fallback if video fails to load
      video.addEventListener('error', () => {
        console.warn('Video failed to load, continuing anyway');
        checkAllLoaded();
      }, { once: true });
    }
  });

  // Set a timeout as a fallback in case videos never load
  setTimeout(() => {
    if (loadedCount < totalVideos) {
      console.warn('Timeout reached waiting for videos, initializing bubbles anyway');
      initBubbles();
    }
  }, 10000); // 10 second timeout
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', checkVideosAndInit);
} else {
  checkVideosAndInit();
}
