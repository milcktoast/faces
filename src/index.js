var clm = window.clm;
var pModel = window.pModel;

var createRegl = require('regl')
var glslify = require('glslify')
var quad = require('glsl-quad')

var glMatrix = require('gl-matrix')
var vec2 = glMatrix.vec2
var mat4 = glMatrix.mat4

var oui = require('ouioui')

var scratchMat4 = mat4.create()

// TODO: Add ctrack image debug elements as controls component
var ctrackImage = document.getElementById('ctrack-image')
var ctrackOverlay = document.getElementById('ctrack-overlay')
var ctrackConvergence = document.getElementById('ctrack-convergence')
var ctrackImageCtx = ctrackImage.getContext('2d')
var ctrackOverlayCtx = ctrackOverlay.getContext('2d')

var compositeContainer = document.getElementById('composite')
var regl = createRegl({
  container: compositeContainer,
  attributes: {
    preserveDrawingBuffer: true
  }
})

var controls = oui.datoui({
  label: 'Controls'
})
var state = {
  imageIndex: -1,
  imageCount: 17,

  convergence: 0,
  convergenceTarget: 8000,
  isRunning: true,

  opacity: 0.05,
  composite: 'hard-light',

  width: 0,
  height: 0,
  projection: mat4.create(),
  view: mat4.create(),

  clear: function () {
    regl.clear({
      color: [1, 1, 1, 1]
    })
  },
  restart: function () {
    state.imageIndex = -1
    if (!state.isRunning) {
      state.isRunning = true
      loadNextFaceImage()
    }
  }
}

var folderDetection = controls.addFolder({label: 'Face Detection', open: true})
folderDetection.add(state, 'convergence', {
  control: oui.controls.Slider,
  min: 0,
  max: 20000
})
folderDetection.add(state, 'convergenceTarget', {
  control: oui.controls.Slider,
  min: 0,
  max: 20000
})
folderDetection.add(state, 'imageIndex', {
  control: oui.controls.Slider,
  min: -1,
  max: state.imageCount - 1
})
folderDetection.add(state, 'restart')

var folderGraphics = controls.addFolder({label: 'Graphics', open: true})
folderGraphics.add(state, 'opacity', {
  control: oui.controls.Slider,
  min: 0,
  max: 1,
  step: 0.05
})
folderGraphics.add(state, 'composite', {
  control: oui.controls.ComboBox,
  options: [
    'source-over','source-in', 'source-out', 'source-atop', 'destination-over',
    'destination-in', 'destination-out', 'destination-atop', 'lighten', 'copy', 'xor',
    'multiply', 'screen', 'overlay', 'darken', 'color-dodge', 'color-burn', 'hard-light',
    'soft-light', 'difference', 'exclusion', 'hue', 'saturation', 'color', 'luminosity'
  ]
})
folderGraphics.add(state, 'clear')

var ctrack = new clm.tracker({
  scoreThreshold: 0.5,
  stopOnConvergence: true,
  useWebGL: true,
  useWebWorkers: true
})
ctrack.init(pModel)

var linesOuterFace = [
  [0, 7, 14, 0]
]
var linesCenterFace = [
  [33, 62, 37, 47, 53]
]

function drawDebugLines (ctx, color, lines, positions) {
  ctx.lineWidth = 1
  ctx.strokeStyle = color

  var line, pos
  ctx.beginPath()
  for (var i = 0; i < lines.length; i++) {
    line = lines[i]
    pos = positions[line[0]]
    ctx.moveTo(pos[0], pos[1])
    for (var j = 0; j < line.length; j++) {
      pos = positions[line[j]]
      ctx.lineTo(pos[0], pos[1])
    }
  }
  ctx.stroke()
}

var faceImage = null
function loadNextFaceImage () {
  if (state.imageIndex === state.imageCount - 1) {
    state.isRunning = false
    return
  }
  var src = './static/assets/images/test/' + (++state.imageIndex) + '.jpg'
  faceImage = new Image()
  faceImage.onload = function () {
    ctrackImageCtx.clearRect(0, 0, 600, 400)
    ctrackImageCtx.drawImage(faceImage, 0, 0, 600, 400)
    startSearchFace()
  }
  faceImage.src = src
}

var drawSearchProgressReq
function drawSearchProgress () {
  var ctx = ctrackOverlayCtx
  var convergence = ctrack.getConvergence()
  var positions = ctrack.getCurrentPosition()

  ctx.clearRect(0, 0, 600, 400)
  if (positions) {
    ctrack.draw(ctrackOverlay)
    drawDebugLines(ctx, 'cyan', linesOuterFace, positions)
    drawDebugLines(ctx, 'magenta', linesCenterFace, positions)
  }

  state.convergence = convergence
  ctrackConvergence.textContent = convergence.toFixed(3)
  if (convergence < state.convergenceTarget) {
    stopSearchFace()
  } else {
    drawSearchProgressReq = requestAnimationFrame(drawSearchProgress)
  }
}

function getSegmentAngle (a, b) {
  var rel = vec2.sub([], b, a)
  return Math.atan2(rel[1], rel[0])
}

function getCentroid (out, points) {
  vec2.set(out, 0, 0)
  for (var i = 0; i < points.length; i++) {
    vec2.add(out, out, points[i])
  }
  vec2.scale(out, out, 1 / points.length)
  return out
}

/*
function drawCurrentFace () {
  var ctx = compositeImageCtx
  var image = faceImage
  var positions = ctrack.getCurrentPosition()
  if (!positions) return

  var width = state.width
  var height = state.height

  var posA = positions[0]
  var posB = positions[7]
  var posC = positions[14]

  var center = getCentroid([], [posA, posB, posC])
  var angleAC = getSegmentAngle(posA, posC)
  var lengthAC = vec2.dist(posA, posC)

  var targetLengthAC = width * 0.25
  var scale = targetLengthAC / lengthAC

  ctx.save()
  ctx.translate(width / 2, height / 2)
  ctx.rotate(-angleAC)
  ctx.scale(scale, scale)
  ctx.translate(-center[0], -center[1])

  ctx.globalAlpha = state.opacity
  ctx.globalCompositeOperation = state.composite
  ctx.drawImage(ctrackImage, 0, 0, 600, 400)
  // ctx.drawImage(ctrackOverlay, 0, 0, 600, 400)

  ctx.restore()
}
*/

var quadTransform = mat4.create()
var quadTexture = regl.texture({
  width: 600,
  height: 400,
  min: 'linear',
  mag: 'linear'
})
var drawTexture = regl({
  frag: glslify('./shaders/composite-quad.frag'),
  vert: glslify('./shaders/composite-quad.vert'),
  attributes: {
    a_position: quad.verts,
    a_uv: quad.uvs
  },
  elements: quad.indices,
  uniforms: {
    u_texture: regl.prop('texture'),
    u_projection: function () {
      return state.projection
    },
    u_view: function () {
      return state.view
    },
    u_model: regl.prop('transform'),
    u_size: regl.prop('size'),
    u_opacity: regl.prop('opacity')
  },
  blend: {
    enable: true,
    func: {
      srcRGB: 'src alpha',
      srcAlpha: 1,
      dstRGB: 'one minus src alpha',
      dstAlpha: 1
    },
    equation: {
      rgb: 'add',
      alpha: 'add'
    }
  },
  depth: {
    enable: false
  }
});

function drawCurrentFace () {
  var positions = ctrack.getCurrentPosition()
  var image = ctrackImage
  var texture = quadTexture
  var transform = quadTransform
  if (!positions) return

  var width = state.width
  var height = state.height

  var posA = positions[0]
  var posB = positions[7]
  var posC = positions[14]

  var center = getCentroid([], [posA, posB, posC])
  var angleAC = getSegmentAngle(posA, posC)
  var lengthAC = vec2.dist(posA, posC)

  var targetLengthAC = width * 0.3
  var scale = targetLengthAC / lengthAC

  mat4.identity(transform, transform)

  mat4.identity(scratchMat4, scratchMat4)
  mat4.rotateZ(transform, transform, -angleAC)
  mat4.multiply(transform, transform, scratchMat4)

  mat4.identity(scratchMat4, scratchMat4)
  mat4.scale(scratchMat4, scratchMat4, [scale, scale, scale])
  mat4.multiply(transform, transform, scratchMat4)

  mat4.identity(scratchMat4, scratchMat4)
  mat4.translate(scratchMat4, scratchMat4, [image.width / 2, image.height / 2, 0])
  mat4.multiply(transform, transform, scratchMat4)

  mat4.identity(scratchMat4, scratchMat4)
  mat4.translate(scratchMat4, scratchMat4, [-center[0], -center[1], 0])
  mat4.multiply(transform, transform, scratchMat4)

  quadTexture({
    data: image
  })
  drawTexture({
    transform: transform,
    texture: texture,
    size: [image.width, image.height],
    opacity: state.opacity
  })
}

function startSearchFace () {
  console.time('searchFace')
  ctrack.start(ctrackImage)
  drawSearchProgress()
}

function stopSearchFace (err) {
  if (err) console.warn(err, state.imageIndex)
  if (!err) drawCurrentFace()
  console.timeEnd('searchFace')
  ctrack.stop()
  ctrack.reset()
  cancelAnimationFrame(drawSearchProgressReq)
  drawSearchProgressReq = null
  setTimeout(loadNextFaceImage, 1)
}

function resize () {
  var width = window.innerWidth
  var height = window.innerHeight
  state.width = width
  state.height = height
  mat4.ortho(state.projection,
    -width / 2, width / 2,
    height / 2, -height / 2,
    0, 1)
}

// detect if tracker fails to find a face
document.addEventListener('clmtrackrNotFound', function (event) {
  stopSearchFace('clmtrackrNotFound')
}, false)

// detect if tracker loses tracking of face
document.addEventListener('clmtrackrLost', function (event) {
  stopSearchFace('clmtrackrLost')
}, false)

// detect if tracker has converged
document.addEventListener('clmtrackrConverged', function (event) {
  stopSearchFace()
}, false)

window.addEventListener('resize', resize, false)

// --------------------------------------------------

resize()
loadNextFaceImage()
