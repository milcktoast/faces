var clm = window.clm;
var pModel = window.pModel;

var createRegl = require('regl')
var glslify = require('glslify')
var glMatrix = require('gl-matrix')
var vec2 = glMatrix.vec2
var mat4 = glMatrix.mat4
var oui = require('ouioui')

var quad = require('./utils/quad')
var blendModes = require('./constants/blend-modes')
var sizeSuffixes = require('./constants/size-suffixes')

var scratchMat4 = mat4.create()

var instructions = document.getElementById('instructions')
var ctrackContainer = document.getElementById('ctrack')
var ctrackImage = document.createElement('canvas')
var ctrackOverlay = document.createElement('canvas')
var ctrackImageCtx = ctrackImage.getContext('2d')
var ctrackOverlayCtx = ctrackOverlay.getContext('2d')

ctrackOverlay.style.position = 'absolute'
ctrackOverlay.style.top = '0px'
ctrackOverlay.style.left = '0px'
ctrackContainer.appendChild(ctrackImage)
ctrackContainer.appendChild(ctrackOverlay)

var compositeContainer = document.getElementById('composite')
var regl = createRegl({
  container: compositeContainer
})

// ..................................................
// Controls, state

var controls = oui.datoui({
  label: 'Settings'
})

var state = {
  searchPhrase: decodeSearchFromUrl() || '--',
  searchSize: sizeSuffixes['800'],
  searchMaxResults: 60,
  searchProgress: 0,
  searchResults: '--',
  isSearching: false,

  activeImage: null,
  images: null,
  imageIndex: -1,
  imageCount: -1,
  imageProgress: '--',

  convergence: 0,
  convergenceTarget: 10,
  showComputeCanvas: true,
  autoRestart: false,
  isRunning: false,
  _drawnFaces: 0,
  drawnFaces: '----',

  drawOpacity: 0.75,
  blendMode: blendModes['HARD_LIGHT'],
  blendOpacity: 0.15,

  blurRadius: 8,
  blurCenter: {x: 0.5, y: 0.45},

  instructionsVisible: true,
  shouldDrawScene: false,
  shouldDrawFace: false,

  exportFormat: 'image/jpeg',
  exportQuality: 85,

  clearColor: [24 / 255, 7 / 255, 31 / 255, 1],
  clearColorRgb: function () {
    return state.clearColor.slice(0, 3)
  },

  width: 0,
  height: 0,
  projection: mat4.create(),
  projectionView: mat4.create(),
  tick: 0,

  search: function () {
    searchPhotosAndLoad()
  },
  clear: function () {
    clearScene()
  },
  restart: function () {
    state.imageIndex = -1
    if (!state.isRunning) {
      state.isRunning = true
      loadNextFaceImage()
    }
  },
  export: function () {
    exportAsImage()
  }
}

var folderSearcher = controls.addFolder({
  label: 'Photo Searcher',
  open: true
})
folderSearcher.add(state, 'searchPhrase', {
  onSubmit: function () {
    searchPhotosAndLoad()
  }
})
folderSearcher.add(state, 'searchSize', {
  control: oui.controls.ComboBox,
  options: sizeSuffixes
})
folderSearcher.add(state, 'searchMaxResults', {
  control: oui.controls.Slider,
  min: 10,
  max: 500,
  step: 10
})
folderSearcher.add(state, 'searchProgress', {
  control: oui.controls.Slider,
  min: 0,
  max: 1
})
folderSearcher.add(state, 'searchResults')
folderSearcher.add(state, 'search')

var folderDetector = controls.addFolder({
  label: 'Face Detector',
  open: false
})
folderDetector.add(state, 'showComputeCanvas', {
  onChange: function (shouldShow) {
    if (shouldShow) {
      ctrackContainer.style.display = 'block'
    } else {
      ctrackContainer.style.display = 'none'
    }
  }
})
folderDetector.add(state, 'autoRestart')
folderDetector.add(state, 'convergence', {
  control: oui.controls.Slider,
  min: 0,
  max: 20000
})
folderDetector.add(state, 'convergenceTarget', {
  control: oui.controls.Slider,
  min: 0.5,
  max: 500
})
folderDetector.add(state, 'imageProgress')
folderDetector.add(state, 'drawnFaces')
folderDetector.add(state, 'restart')

var folderCompositor = controls.addFolder({
  label: 'Compositor',
  open: false
})
folderCompositor.add(state, 'drawOpacity', {
  control: oui.controls.Slider,
  min: 0,
  max: 1,
  step: 0.05
})
folderCompositor.add(state, 'blendOpacity', {
  control: oui.controls.Slider,
  min: 0,
  max: 1,
  step: 0.05
})
folderCompositor.add(state, 'blendMode', {
  control: oui.controls.ComboBox,
  options: blendModes
})
folderCompositor.add(state, 'blurRadius', {
  control: oui.controls.Slider,
  min: 0,
  max: 64,
  step: 2
})
folderCompositor.add(state, 'blurCenter', {
  control: oui.controls.XYPad,
  min: {x: 0, y: 0},
  max: {x: '1.0', y: '1.0'},
  open: true
})
folderCompositor.add(state, 'clearColor', {
  control: oui.controls.ColorPicker,
  open: true
})
folderCompositor.add(state, 'clear')

var folderExporter = controls.addFolder({
  label: 'Exporter',
  open: false
})
folderExporter.add(state, 'exportFormat', {
  control: oui.controls.ComboBox,
  options: {
    'jpeg': 'image/jpeg',
    'png': 'image/png',
    'webp': 'image/webp'
  }
})
folderExporter.add(state, 'exportQuality', {
  control: oui.controls.Slider,
  min: 1,
  max: 100
})
folderExporter.add(state, 'export')

// ..................................................
// Instructions

function showInstructions () {
  instructions.innerHTML = '> Enter a <em>searchPhrase</em> to begin.'
  instructions.style.display = 'block'
}

function hideInstructions () {
  if (!state.instructionsVisible) return
  state.instructionsVisible = false
  instructions.style.display = 'none'
}

// ..................................................
// Face detection

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

var drawSearchProgressReq
function drawSearchProgress () {
  var el = ctrackOverlay
  var ctx = ctrackOverlayCtx
  var convergence = ctrack.getConvergence()
  var positions = ctrack.getCurrentPosition()

  if (positions) {
    ctx.clearRect(0, 0, el.width, el.height)
    ctrack.draw(ctrackOverlay)
    drawDebugLines(ctx, 'cyan', linesOuterFace, positions)
    drawDebugLines(ctx, 'magenta', linesCenterFace, positions)
  }

  state.convergence = convergence
  if (convergence < state.convergenceTarget) {
    stopSearchFace()
  } else {
    drawSearchProgressReq = requestAnimationFrame(drawSearchProgress)
  }
}

// ..................................................
// Fetch, load face image candidates

function searchPhotosAndLoad () {
  if (state.isSearching) return
  state.isSearching = true
  state.isRunning = false
  state.searchProgress = 0
  state.searchResults = '--'
  hideInstructions()
  syncSearchUrl()
  trickleSearchProgress()
  searchPhotos().then(function (data) {
    state.images = data.images
    state.imageCount = data.images.length
    state.searchProgress = 1
    state.searchResults = state.imageCount + ' / ' + data.total
    state.isSearching = false
    state.isRunning = true
    loadNextFaceImage()
  })
}

function decodeSearchFromUrl () {
  var urlSearch = location.search
  if (urlSearch.indexOf('s=') === -1) return null
  return urlSearch.replace('?s=', '').replace(/\+/g, ' ')
}

function syncSearchUrl () {
  var phrase = state.searchPhrase.replace(/\s/g, '+')
  var nextUrl = '?s=' + phrase
  if (nextUrl !== location.search) {
    history.pushState({}, '', nextUrl)
  }
}

// TODO: Add search paging
// TODO: Select photos from multiple size candidates
var searchPhotosState = {}
function searchPhotos () {
  var nextSearchHash = hashSearchState()
  if (nextSearchHash === searchPhotosState.hash) {
    return Promise.resolve(searchPhotosState.results)
  }
  var size = sizeWithSuffix(state.searchSize)
  var searchUrl = 'https://api.flickr.com/services/rest/?' +
    serializeSearchParams({
      method: 'flickr.photos.search',
      api_key: '0fa09f66a4b7b225cbf8b7073b125c93',
      text: state.searchPhrase,
      sort: 'relevance',
      license: '1,2,9,10', // modifications allowed
      safe_search: '1', // safe
      content_type: '1', // photos only
      extras: size.url,
      per_page: state.searchMaxResults,
      format: 'json',
      nojsoncallback: '1'
    })
  return fetch(searchUrl)
    .then(resToJson)
    .then(function (json) {
      var photos = json.photos
      var total = parseInt(photos.total, 10)
      var images = photos.photo
        .map(mapPhoto.bind(null, size))
        .filter(notNull)
      var results = {
        total: total,
        images: images
      }
      searchPhotosState.hash = nextSearchHash
      searchPhotosState.results = results
      return results
    })
}

function hashSearchState () {
  return [
    state.searchPhrase,
    state.searchMaxResults,
    state.searchSize
  ].join('_')
}

function loadNextFaceImage () {
  if (!state.isRunning) return
  if (state.imageIndex >= state.imageCount - 1) {
    state.imageIndex = -1
    if (!state.autoRestart) {
      state.isRunning = false
      clearComputeCanvas()
      return
    }
  }
  var data = state.images[++state.imageIndex]
  var width = data.width
  var height = data.height

  // TODO: Enable smaller search compute canvas
  // var width, height
  // if (data.width > data.height) {
  //   width = Math.min(1024, data.width)
  //   height = Math.round(width / data.width * data.height)
  // } else {
  //   height = Math.min(1024, data.height)
  //   width = Math.round(height / data.height * data.width)
  // }

  var image = new Image()
  image.crossOrigin = 'Anonymous'
  image.onload = function () {
    ctrackImage.width = width
    ctrackImage.height = height
    ctrackOverlay.width = width
    ctrackOverlay.height = height
    ctrackImageCtx.clearRect(0, 0, width, height)
    ctrackImageCtx.drawImage(image, 0, 0, width, height)
    state.activeImage = image
    state.imageProgress = (state.imageIndex + 1) + ' / ' + state.imageCount
    startSearchFace()
  }
  image.src = data.url
}

function clearComputeCanvas () {
  ctrackImageCtx.clearRect(0, 0, ctrackImage.width, ctrackImage.height)
  ctrackOverlayCtx.clearRect(0, 0, ctrackOverlay.width, ctrackOverlay.height)
}

function resToJson (res) {
  return res.json()
}

function mapPhoto (size, photo) {
  if (!photo[size.url]) return null
  return {
    url: photo[size.url],
    width: parseInt(photo[size.width], 10),
    height: parseInt(photo[size.height], 10)
  }
}

function notNull (v) {
  return v != null
}

function sizeWithSuffix (suffix) {
  return {
    url: 'url_' + suffix,
    width: 'width_' + suffix,
    height: 'height_' + suffix
  }
}

function serializeSearchParams (params) {
  return Object.keys(params).map(function (key) {
    return key + '=' + params[key]
  }).join('&')
}

function trickleSearchProgress () {
  if (state.searchProgress === 1) return
  state.searchProgress += (1 - state.searchProgress) * 0.02
  setTimeout(trickleSearchProgress, 100)
}

// ..................................................
// Post processing

function createPostBuffers () {
  var buffers = {
    read: createBuffer(),
    write: createBuffer()
  }
  function createBuffer () {
    return regl.framebuffer({
      color: regl.texture({wrap: 'clamp'}),
      depth: false
    })
  }
  function getBuffer (name) {
    return function (width, height) {
      var buffer = buffers[name]
      if (width && height) buffer.resize(width, height)
      return buffer
    }
  }
  return {
    getRead: getBuffer('read'),
    getWrite: getBuffer('write'),
    resize: function (width, height) {
      buffers.read.resize(width, height)
      buffers.write.resize(width, height)
    },
    swap: function () {
      var read = buffers.read
      var write = buffers.write
      buffers.read = write
      buffers.write = read
    },
    clear: function () {
      buffers.read.resize(1, 1)
      buffers.write.resize(1, 1)
    }
  }
}

var sceneBuffers = createPostBuffers()
var fxBuffers = createPostBuffers()
var setupFBO = regl({
  framebuffer: regl.prop('fbo')
})

var setupDrawScreen = regl({
  vert: glslify('./shaders/post-fx.vert'),
  attributes: {
    a_position: [-4, -4, 4, -4, 0, 4]
  },
  count: 3,
  depth: {enable: false}
})

var drawHashBlur = regl({
  frag: glslify('./shaders/post-fx-hash-blur.frag'),
  uniforms: {
    u_color: regl.prop('color'),
    u_background: regl.prop('background'),
    u_blendMode: regl.prop('blendMode'),
    u_blendOpacity: regl.prop('blendOpacity'),
    u_vignetteColor: regl.prop('vignetteColor'),
    u_blurCenter: regl.prop('blurCenter'),
    u_blurRadius: regl.prop('blurRadius'),
    u_offset: regl.prop('offset'),
    u_resolution: regl.prop('resolution'),
  },
  depth: {enable: false}
})

var drawScreen = regl({
  frag: glslify('./shaders/post-fx.frag'),
  uniforms: {
    u_color: regl.prop('color')
  }
})

// ..................................................
// Sprite quad

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
      return state.projectionView
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
  depth: {enable: false}
});

// ..................................................
// Transform, draw current face image

function transformCurrentFace (transform, positions, image) {
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

  // TODO: Optimize transforms
  mat4.identity(transform)

  mat4.identity(scratchMat4)
  mat4.rotateZ(transform, transform, -angleAC)
  mat4.multiply(transform, transform, scratchMat4)

  mat4.identity(scratchMat4)
  mat4.scale(scratchMat4, scratchMat4, [scale, scale, scale])
  mat4.multiply(transform, transform, scratchMat4)

  mat4.identity(scratchMat4)
  mat4.translate(scratchMat4, scratchMat4,
    [image.naturalWidth / 2, image.naturalHeight / 2, 0])
  mat4.multiply(transform, transform, scratchMat4)

  mat4.identity(scratchMat4)
  mat4.translate(scratchMat4, scratchMat4, [-center[0], -center[1], 0])
  mat4.multiply(transform, transform, scratchMat4)
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

function drawCurrentFace (context) {
  var positions = ctrack.getCurrentPosition()
  if (!positions) return

  var image = state.activeImage
  var texture = quadTexture
  var transform = quadTransform
  var width = state.width
  var height = state.height
  var tick = state.tick++
  var clearColor = state.clearColorRgb()

  state.drawnFaces = padLeft(++state._drawnFaces + '', '0', 4)
  transformCurrentFace(transform, positions, image)
  quadTexture({
    data: image,
    width: image.naturalWidth,
    height: image.naturalHeight
  })

  sceneBuffers.resize(width, height)
  fxBuffers.resize(width, height)

  // sceneBuffers.swap()
  setupFBO({fbo: sceneBuffers.getWrite()}, function () {
    regl.clear({
      color: clearColor
    })
    drawTexture({
      transform: transform,
      texture: texture,
      size: [image.naturalWidth, image.naturalHeight],
      opacity: state.drawOpacity
    })
  })

  setupDrawScreen(function () {
    fxBuffers.swap()
    setupFBO({fbo: fxBuffers.getWrite()}, function () {
      drawHashBlur({
        color: sceneBuffers.getWrite(),
        background: fxBuffers.getRead(),
        vignetteColor: clearColor,
        blendMode: state.blendMode,
        blendOpacity: state.blendOpacity,
        blurCenter: [state.blurCenter.x, 1 - state.blurCenter.y],
        blurRadius: state.blurRadius,
        offset: Math.sin(tick * 0.1),
        resolution: [width, height]
      })
    })
    drawScreen({
      color: fxBuffers.getWrite()
    })
  })
}

function drawCurrentScene (context) {
  var transform = quadTransform
  fxBuffers.swap()
  var write = fxBuffers.getWrite()
  var read = fxBuffers.getRead()

  mat4.identity(transform)
  mat4.scale(transform, transform, [1, -1, 1])
  write.resize(state.width, state.height)

  setupFBO({fbo: write}, function () {
    regl.clear({
      color: state.clearColor
    })
    drawTexture({
      transform: transform,
      texture: read,
      size: [read.width, read.height],
      opacity: 1
    })
  })

  setupDrawScreen(function () {
    drawScreen({
      color: write
    })
  })
}

function clearScene () {
  state._drawnFaces = 0
  state.drawnFaces = '----'
  setupFBO({fbo: fxBuffers.getWrite()}, function () {
    regl.clear({
      color: state.clearColor
    })
  })
  state.shouldDrawScene = true
}

function padLeft (str, fill, length) {
  while (str.length < length) str = fill + str
  return str
}

// ..................................................
// Export

function exportAsImage () {
  var canvas = compositeContainer.querySelector('canvas')
  drawCurrentScene()
  window.open(canvas.toDataURL(
    state.exportFormat, state.exportQuality / 100))
}

// ..................................................
// Face search flow

var nextSearchTimeout
function startSearchFace () {
  console.time('searchFace')
  ctrack.start(ctrackImage)
  nextSearchTimeout = setTimeout(stopSearchFace.bind(null, 'searchFaceTimeout'), 2000)
  drawSearchProgress()
}

function stopSearchFace (err) {
  console.timeEnd('searchFace')

  cancelAnimationFrame(drawSearchProgressReq)
  clearTimeout(nextSearchTimeout)
  drawSearchProgressReq = null
  nextSearchTimeout = null

  if (err) {
    console.warn(err, state.imageIndex)
    searchNextFace()
  } else {
    ctrack.stop()
    state.shouldDrawFace = true
  }
}

function searchNextFace () {
  ctrack.stop()
  ctrack.reset()
  setTimeout(loadNextFaceImage, 1)
}

// TODO: Draw current framebuffer state to screen at correct scale
function resize () {
  var width = window.innerWidth
  var height = window.innerHeight
  state.width = width
  state.height = height
  mat4.ortho(state.projection,
    -width / 2, width / 2,
    height / 2, -height / 2,
    0, 1)
  state.shouldDrawScene = true
}

function frame (context) {
  if (state.shouldDrawScene) {
    state.shouldDrawScene = false
    drawCurrentScene(context)
  }
  if (state.shouldDrawFace) {
    state.shouldDrawFace = false
    drawCurrentFace(context)
    searchNextFace()
  }
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
regl.frame(frame)

// ..................................................

resize()
clearScene()
if (state.searchPhrase !== '--') {
  setTimeout(searchPhotosAndLoad, 200)
} else {
  showInstructions()
}
