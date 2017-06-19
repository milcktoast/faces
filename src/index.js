var clm = window.clm;
var pModel = window.pModel;

var glMatrix = require('gl-matrix')
var vec2 = glMatrix.vec2

var ctrackImage = document.getElementById('ctrack-image')
var ctrackOverlay = document.getElementById('ctrack-overlay')
var ctrackConvergence = document.getElementById('ctrack-convergence')
var ctrackImageCtx = ctrackImage.getContext('2d')
var ctrackOverlayCtx = ctrackOverlay.getContext('2d')

var compositeImage = document.getElementById('composite-image')
var compositeImageCtx = compositeImage.getContext('2d')

var viewState = {
  width: 0,
  height: 0
}

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

var faceImagesCount = 17
var faceImageIndex = -1
var faceImage = null
function loadNextFaceImage () {
  if (faceImageIndex === faceImagesCount - 1) return
  var src = './static/assets/test/' + (++faceImageIndex) + '.jpg'
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

  ctrackConvergence.textContent = convergence.toFixed(3)
  if (convergence < 100) {
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

function drawCurrentFace () {
  var ctx = compositeImageCtx
  var image = faceImage
  var positions = ctrack.getCurrentPosition()
  if (!positions) return

  var width = viewState.width
  var height = viewState.height

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

  ctx.globalAlpha = 0.7
  ctx.globalCompositeOperation = 'lighten'
  ctx.drawImage(ctrackImage, 0, 0, 600, 400)
  // ctx.drawImage(ctrackOverlay, 0, 0, 600, 400)

  ctx.restore()
}

function startSearchFace () {
  console.time('searchFace')
  ctrack.start(ctrackImage)
  drawSearchProgress()
}

function stopSearchFace (err) {
  if (err) console.warn(err, faceImageIndex)
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
  viewState.width = width
  viewState.height = height
  resizeCanvas(compositeImage, width, height)
}

function resizeCanvas (canvas, width, height) {
  canvas.width = width
  canvas.height = height
  canvas.style.width = width + 'px'
  canvas.style.height = height + 'px'
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

window.addEventListener('resize', resize)

// --------------------------------------------------

resize()
loadNextFaceImage()
