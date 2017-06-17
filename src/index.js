var clm = window.clm;
var pModel = window.pModel;

var ctrackImage = document.getElementById('ctrack-image')
var ctrackOverlay = document.getElementById('ctrack-overlay')
var ctrackImageCtx = ctrackImage.getContext('2d')
var ctrackOverlayCtx = ctrackOverlay.getContext('2d')

var ctrack = new clm.tracker({
  stopOnConvergence: true
})
ctrack.init(pModel)

var image = new Image()
image.onload = onImageLoad
image.src = './assets/mitch/001.jpg'

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

function onImageLoad () {
  ctrackImageCtx.drawImage(image, 0, 0, 600, 400)
  searchFace()
}

function searchFace () {
  ctrack.start(ctrackImage)
  drawSearchProgress()
}

var drawSearchProgressReq
function drawSearchProgress () {
  var positions = ctrack.getCurrentPosition()
  ctrackOverlayCtx.clearRect(0, 0, 600, 400)
  if (positions) {
    ctrack.draw(ctrackOverlay)
    drawDebugLines(ctrackOverlayCtx, 'cyan', linesOuterFace, positions)
    drawDebugLines(ctrackOverlayCtx, 'magenta', linesCenterFace, positions)
  }
  drawSearchProgressReq = requestAnimationFrame(drawSearchProgress)
}

// detect if tracker fails to find a face
document.addEventListener('clmtrackrNotFound', function (event) {
  ctrack.stop()
  console.warn('clmtrackrNotFound')
}, false)

// detect if tracker loses tracking of face
document.addEventListener('clmtrackrLost', function (event) {
  ctrack.stop()
  console.warn('clmtrackrLost')
}, false)

// detect if tracker has converged
document.addEventListener('clmtrackrConverged', function (event) {
  cancelAnimationFrame(drawSearchProgressReq)
  drawSearchProgressReq = null
  console.log('clmtrackrConverged')
}, false)
