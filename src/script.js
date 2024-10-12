/* eslint-disable space-before-function-paren */
import './style.css'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import Stats from 'three/examples/jsm/libs/stats.module'
import { MarchingCubes } from 'three/addons/objects/MarchingCubes.js'
import Vertex from './vertex.glsl'
import Fragment from './fragment.glsl'
import { createNoise2D } from 'simplex-noise'

export default class ThreeJsDraft {
  constructor() {
    /**
     * Variables
    */
    this.canvas = document.querySelector('canvas.webgl')
    this.width = window.innerWidth
    this.height = window.innerHeight
    this.devicePixelRatio = window.devicePixelRatio

    this.noise2D = createNoise2D()

    /**
     * Scene
     */
    this.scene = new THREE.Scene()

    this.resolution = 40

    this.mouseX = 0
    this.mouseY = 0

    /**
     * Camera
     */
    this.camera = new THREE.PerspectiveCamera(75, this.width / this.height, 0.1, 1000)
    this.camera.position.z = 5

    this.clock = new THREE.Clock()

    this.time = 0.0

    /**
     * Renderer
     */
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas
    })
    this.renderer.setSize(this.width, this.height)
    this.renderer.setPixelRatio(Math.min(this.devicePixelRatio, 2))

    /**
     * Controls
     */
    this.orbitControls = new OrbitControls(this.camera, this.canvas)
    this.orbitControls.enabled = false

    /**
     * Resize
     */
    window.addEventListener('resize', () => {
      this.width = window.innerWidth
      this.height = window.innerHeight
      this.camera.aspect = this.width / this.height
      this.camera.updateProjectionMatrix()

      this.devicePixelRatio = window.devicePixelRatio

      this.renderer.setSize(this.width, this.height)
      this.renderer.setPixelRatio(Math.min(this.devicePixelRatio, 2))
    }, false)

    document.addEventListener('mousemove', (event) => {
      this.mouseX = event.clientX
      this.mouseY = event.clientY
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

    /**
     * Load Assets
     */
    this.loadAssets()

    /**
     * Helpers
     */
    this.addHelpers()

    /**
     * Objects
     */
    this.addObjects()

    this.renderer.render(this.scene, this.camera)
    /**
     * Animation Loop
     */
    this.animate()
  }

  loadAssets() {
    // const textureLoader = new THREE.TextureLoader(this.loadingManager)
  }

  addHelpers() {
    const axisHelper = new THREE.AxesHelper(3)
    this.scene.add(axisHelper)

    this.stats = Stats()
    document.body.appendChild(this.stats.dom)
  }

  addObjects() {
    // Material designation
    const materials = this.generateMaterials()
    const currentMaterial = 'shader' // <= Material_Name

    // Make MARCHING CUBES
    this.effect = new MarchingCubes(this.resolution, materials[currentMaterial], true, true, 100000)
    this.effect.position.set(0, 0, 0)
    this.effect.scale.set(3, 3, 3) // individual setting
    this.effect.enableUvs = false
    this.effect.enableColors = false

    this.scene.add(this.effect)

    // Upedate Contorll Parameter  MARCHING CUBES
    this.effectController = {
      material: 'shader', // <= ★ Change the name 'basic' to 'shader'
      speed: 1.0, // スピード
      numBlobs: 75, // 個数
      resolution: 40, // 細かさ
      isolation: 20, // 離れる 10~100

      floor: false, // With/without floor
      wallx: false, // With/without wall
      wallz: false, // With/without wall

      dummy: function () { }
    }
  }

  generateMaterials() {
    const materials = {

      basic: new THREE.MeshBasicMaterial({
        color: 0x6699FF,
        wireframe: true
      }),

      shader: new THREE.ShaderMaterial({
        uniforms: {
          uResolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
          uTime: { value: 1.0 },
          uColor: { value: new THREE.Color(0x42a9f1) },
          viewVector: { value: new THREE.Vector3(0, 0, 20) }
        },
        vertexShader: Vertex,
        fragmentShader: Fragment,
        side: THREE.DoubleSide,
        transparent: true,
        wireframe: false
      })
    }

    return materials
  }

  updateCubes(object, time, numblobs, floor, wallx, wallz, mousePosition) {
    object.reset()

    const subtract = 12
    const strength = 1.2 / ((Math.sqrt(numblobs) - 1) / 4 + 1)

    for (let i = 0; i < numblobs; i++) {
      // ★Postion Animation
      const ballx = 0.5 + this.noise2D(i * 1.85 + time * 0.25, i * 1.85 + time * 0.25) * 0.25
      const ballz = 0.5 + this.noise2D(i * 1.9 + time * 0.25, i * 1.9 + time * 0.25) * 0.25
      const bally = 0.5 + this.noise2D(i * 1.8 + time * 0.25, i * 1.8 + time * 0.25) * 0.25

      object.addBall(ballx, bally, ballz, strength, subtract)

      // Material upadate
      object.material.uniforms.viewVector.value = this.camera.position
      object.material.uniformsNeedUpdate = true
    }

    if (floor) object.addPlaneY(2, 12)
    if (wallz) object.addPlaneZ(2, 12)
    if (wallx) object.addPlaneX(2, 12)

    object.update()
  }

  animate() {
    const delta = this.clock.getDelta()
    this.time += delta * this.effectController.speed * 0.5

    if (this.effectController.resolution !== this.resolution) {
      this.resolution = this.effectController.resolution
      this.effect.init(Math.floor(this.resolution))
    }

    if (this.effectController.isolation !== this.effect.isolation) {
      this.effect.isolation = this.effectController.isolation
    }

    const mousePosition = new THREE.Vector3(
      (this.mouseX / window.innerWidth) * 2 - 1,
      -(this.mouseY / window.innerHeight) * 2 + 1,
      0
    )

    this.updateCubes(this.effect, this.time, this.effectController.numBlobs, this.effectController.floor, this.effectController.wallx, this.effectController.wallz, mousePosition)

    this.orbitControls.update()
    this.stats.update()
    this.renderer.render(this.scene, this.camera)
    window.requestAnimationFrame(this.animate.bind(this))
  }
}

/**
 * Create ThreeJsDraft
 */
// eslint-disable-next-line no-new
new ThreeJsDraft()
