var clm = window.clm;
var pModel = window.pModel;

var ctrackImage = document.getElementById('ctrack-image')
var ctrackOverlay = document.getElementById('ctrack-overlay')
var ctrackConvergence = document.getElementById('ctrack-convergence')
var ctrackImageCtx = ctrackImage.getContext('2d')
var ctrackOverlayCtx = ctrackOverlay.getContext('2d')

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

var faceImages = [
  './assets/mitch/001.jpg',
  './assets/mitch/002.jpg',
  './assets/mitch/003.jpg',
  './assets/mitch/004.jpg'
]
var faceImageIndex = 0
function loadNextFaceImage () {
  var src = faceImages[faceImageIndex++]
  if (!src) return
  var image = new Image()
  image.onload = function () {
    ctrackImageCtx.clearRect(0, 0, 600, 400)
    ctrackImageCtx.drawImage(image, 0, 0, 600, 400)
    startSearchFace()
  }
  image.src = src
}

var drawSearchProgressReq
function drawSearchProgress () {
  var convergence = ctrack.getConvergence()
  var positions = ctrack.getCurrentPosition()

  ctrackOverlayCtx.clearRect(0, 0, 600, 400)
  if (positions) {
    ctrack.draw(ctrackOverlay)
    drawDebugLines(ctrackOverlayCtx, 'cyan', linesOuterFace, positions)
    drawDebugLines(ctrackOverlayCtx, 'magenta', linesCenterFace, positions)
  }

  ctrackConvergence.textContent = convergence.toFixed(3)
  if (convergence < 100) {
    stopSearchFace()
  } else {
    drawSearchProgressReq = requestAnimationFrame(drawSearchProgress)
  }
}

function startSearchFace () {
  console.time('searchFace')
  ctrack.start(ctrackImage)
  drawSearchProgress()
}

function stopSearchFace (err) {
  if (err) console.error(err)
  console.timeEnd('searchFace')
  ctrack.stop()
  ctrack.reset()
  cancelAnimationFrame(drawSearchProgressReq)
  drawSearchProgressReq = null
  setTimeout(loadNextFaceImage, 100)
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

// --------------------------------------------------

loadNextFaceImage()
