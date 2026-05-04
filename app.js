let cvReady = false;

// UI Tabs Logic
const tabBtns = document.querySelectorAll('.tab-btn');
const sidePanels = document.querySelectorAll('.side-panel');
const loadingOverlay = document.getElementById('loadingOverlay');
const loadingText = document.getElementById('loadingText');
const statusMessage = document.getElementById('statusMessage');

// Global Camera Variables
let stream = null;
let cameraLoopId = null;
let currentCameraSide = null;
const cameraModal = document.getElementById('cameraModal');
const cameraVideo = document.getElementById('cameraVideo');
const cameraCanvas = document.getElementById('cameraCanvas');
const cameraStatus = document.getElementById('cameraStatus');

let appState = {
    front: {
        currentCroppedMat: null,
        currentSrcMat: null,
        isBlackAndWhite: false,
        isBgRemoved: false,
        cropPoints: [],
        draggingPointIndex: -1,
        originalImgImage: null,
        hasResult: false
    },
    back: {
        currentCroppedMat: null,
        currentSrcMat: null,
        isBlackAndWhite: false,
        isBgRemoved: false,
        cropPoints: [],
        draggingPointIndex: -1,
        originalImgImage: null,
        hasResult: false
    }
};

let activeSide = 'front';

tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        tabBtns.forEach(b => b.classList.remove('active'));
        sidePanels.forEach(p => p.classList.remove('active'));
        
        btn.classList.add('active');
        activeSide = btn.getAttribute('data-side');
        document.getElementById(`side-${activeSide}`).classList.add('active');
    });
});

window.onOpenCvReady = function() {
    cvReady = true;
    loadingOverlay.classList.remove('active');
    console.log("OpenCV.js is ready.");
}

window.onOpenCvError = function() {
    showStatus('Failed to load OpenCV.js. Please check your internet connection.', 'error');
}

function showStatus(message, type) {
    statusMessage.textContent = message;
    statusMessage.className = `status-message ${type}`;
    statusMessage.style.display = 'block';
    setTimeout(() => {
        statusMessage.style.display = 'none';
    }, 5000);
}

// Bind events for both sides
['front', 'back'].forEach(side => {
    const dropzone = document.getElementById(`dropzone-${side}`);
    const fileInput = document.getElementById(`fileInput-${side}`);
    const btnTryAnother = document.getElementById(`btnTryAnother-${side}`);
    const btnConfirmCrop = document.getElementById(`btnConfirmCrop-${side}`);
    const brightnessSlider = document.getElementById(`brightnessSlider-${side}`);
    const contrastSlider = document.getElementById(`contrastSlider-${side}`);
    const btnBlackWhite = document.getElementById(`btnBlackWhite-${side}`);
    const btnRemoveBg = document.getElementById(`btnRemoveBg-${side}`);
    const canvasInput = document.getElementById(`canvasInput-${side}`);
    const btnCamera = document.getElementById(`btnCamera-${side}`);

    if (btnCamera) {
        btnCamera.addEventListener('click', () => startCamera(side));
    }

    dropzone.addEventListener('dragover', (e) => { e.preventDefault(); dropzone.classList.add('dragover'); });
    dropzone.addEventListener('dragleave', () => { dropzone.classList.remove('dragover'); });
    dropzone.addEventListener('drop', (e) => {
        e.preventDefault(); dropzone.classList.remove('dragover');
        if (e.dataTransfer.files.length > 0) handleFile(e.dataTransfer.files[0], side);
    });
    dropzone.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('click', (e) => e.stopPropagation());
    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) handleFile(e.target.files[0], side);
    });

    btnTryAnother.addEventListener('click', () => {
        document.getElementById(`resultsSection-${side}`).classList.remove('active');
        document.getElementById(`uploadSection-${side}`).style.display = 'block';
        fileInput.value = '';
        appState[side].hasResult = false;
    });

    brightnessSlider.addEventListener('input', (e) => {
        document.getElementById(`brightnessValue-${side}`).textContent = e.target.value;
        if (appState[side].currentCroppedMat && cvReady) applyFilters(side);
    });

    contrastSlider.addEventListener('input', (e) => {
        document.getElementById(`contrastValue-${side}`).textContent = e.target.value;
        if (appState[side].currentCroppedMat && cvReady) applyFilters(side);
    });

    btnBlackWhite.addEventListener('click', () => {
        appState[side].isBlackAndWhite = !appState[side].isBlackAndWhite;
        if (appState[side].isBlackAndWhite) {
            btnBlackWhite.classList.remove('btn-secondary');
            btnBlackWhite.classList.add('btn-primary');
        } else {
            btnBlackWhite.classList.remove('btn-primary');
            btnBlackWhite.classList.add('btn-secondary');
        }
        if (appState[side].currentCroppedMat && cvReady) applyFilters(side);
    });

    btnRemoveBg.addEventListener('click', () => {
        appState[side].isBgRemoved = !appState[side].isBgRemoved;
        if (appState[side].isBgRemoved) {
            btnRemoveBg.classList.remove('btn-secondary');
            btnRemoveBg.classList.add('btn-primary');
        } else {
            btnRemoveBg.classList.remove('btn-primary');
            btnRemoveBg.classList.add('btn-secondary');
        }
        if (appState[side].currentCroppedMat && cvReady) applyFilters(side);
    });

    btnConfirmCrop.addEventListener('click', () => {
        performFinalCrop(side);
        showStatus(`${side.toUpperCase()} IC successfully cropped!`, 'success');
    });

    // Canvas interactivity
    canvasInput.addEventListener('mousedown', (e) => handlePointerDown(e, side));
    canvasInput.addEventListener('touchstart', (e) => handlePointerDown(e, side), {passive: false});
    canvasInput.addEventListener('mousemove', (e) => handlePointerMove(e, side));
    canvasInput.addEventListener('touchmove', (e) => handlePointerMove(e, side), {passive: false});
    window.addEventListener('mouseup', () => handlePointerUp(side));
    window.addEventListener('touchend', () => handlePointerUp(side));
});

// Copy Image to Back logic
document.getElementById('btnCopyToBack').addEventListener('click', () => {
    if (appState.front.originalImgImage) {
        // Copy the image over
        appState.back.originalImgImage = appState.front.originalImgImage;
        
        // Show the back UI
        document.getElementById(`uploadSection-back`).style.display = 'none';
        document.getElementById(`resultsSection-back`).classList.add('active');
        
        // Prepare the canvas for OpenCV processing
        const canvasInputBack = document.getElementById('canvasInput-back');
        canvasInputBack.width = appState.front.originalImgImage.width;
        canvasInputBack.height = appState.front.originalImgImage.height;
        const ctx = canvasInputBack.getContext('2d');
        ctx.drawImage(appState.back.originalImgImage, 0, 0, canvasInputBack.width, canvasInputBack.height);
        
        // Run detection
        processCanvasWithOpenCV('back');
        
        // Switch tabs visually
        document.querySelector('.tab-btn[data-side="back"]').click();
        
        showStatus('Image copied! Now drag the pins to the BACK of the IC and click Apply Crop.', 'success');
    }
});

// Canvas Interaction Logic
function getCanvasPos(e, side) {
    const canvasInput = document.getElementById(`canvasInput-${side}`);
    const rect = canvasInput.getBoundingClientRect();
    let clientX = e.clientX;
    let clientY = e.clientY;
    if (e.touches && e.touches.length > 0) {
        clientX = e.touches[0].clientX;
        clientY = e.touches[0].clientY;
    }
    const scaleX = canvasInput.width / rect.width;
    const scaleY = canvasInput.height / rect.height;
    return {
        x: (clientX - rect.left) * scaleX,
        y: (clientY - rect.top) * scaleY
    };
}

function isPointNear(p1, p2, threshold = 50) {
    return Math.hypot(p1.x - p2.x, p1.y - p2.y) < threshold;
}

function handlePointerDown(e, side) {
    if (appState[side].cropPoints.length !== 4) return;
    const pos = getCanvasPos(e, side);
    for (let i = 0; i < 4; i++) {
        if (isPointNear(pos, appState[side].cropPoints[i])) {
            appState[side].draggingPointIndex = i;
            e.preventDefault();
            return;
        }
    }
}

function handlePointerMove(e, side) {
    if (appState[side].draggingPointIndex !== -1) {
        e.preventDefault();
        appState[side].cropPoints[appState[side].draggingPointIndex] = getCanvasPos(e, side);
        drawInputCanvas(side);
    }
}

function handlePointerUp(side) {
    appState[side].draggingPointIndex = -1;
}

function drawInputCanvas(side) {
    const canvasInput = document.getElementById(`canvasInput-${side}`);
    if (!appState[side].originalImgImage && !appState[side].currentSrcMat) return;
    const ctx = canvasInput.getContext('2d');
    ctx.clearRect(0, 0, canvasInput.width, canvasInput.height);
    
    if (appState[side].originalImgImage) {
        ctx.drawImage(appState[side].originalImgImage, 0, 0, canvasInput.width, canvasInput.height);
    } else if (appState[side].currentSrcMat) {
        cv.imshow(canvasInput, appState[side].currentSrcMat);
    }
    
    if (appState[side].cropPoints.length === 4) {
        ctx.beginPath();
        ctx.moveTo(appState[side].cropPoints[0].x, appState[side].cropPoints[0].y);
        for (let i = 1; i < 4; i++) {
            ctx.lineTo(appState[side].cropPoints[i].x, appState[side].cropPoints[i].y);
        }
        ctx.closePath();
        ctx.lineWidth = 4;
        ctx.strokeStyle = '#10b981';
        ctx.stroke();
        ctx.fillStyle = 'rgba(16, 185, 129, 0.15)';
        ctx.fill();
        
        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = '#10b981';
        ctx.lineWidth = 3;
        for (let i = 0; i < 4; i++) {
            ctx.beginPath();
            ctx.arc(appState[side].cropPoints[i].x, appState[side].cropPoints[i].y, 12, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
        }
    }
}

function applyFilters(side) {
    const brightnessSlider = document.getElementById(`brightnessSlider-${side}`);
    const contrastSlider = document.getElementById(`contrastSlider-${side}`);
    const canvasOutput = document.getElementById(`canvasOutput-${side}`);
    
    let bVal = parseInt(brightnessSlider.value);
    let cVal = parseInt(contrastSlider.value);
    
    let beta = (bVal - 100);
    let alpha = cVal / 100;
    
    let dst = new cv.Mat();
    appState[side].currentCroppedMat.convertTo(dst, -1, alpha, beta);
    
    if (appState[side].isBgRemoved) {
        let hsv = new cv.Mat();
        cv.cvtColor(dst, hsv, cv.COLOR_RGBA2RGB);
        cv.cvtColor(hsv, hsv, cv.COLOR_RGB2HSV);
        
        // Slightly tighter green bounds
        let lower_green = new cv.Mat(hsv.rows, hsv.cols, hsv.type(), [35, 50, 20, 0]);
        let upper_green = new cv.Mat(hsv.rows, hsv.cols, hsv.type(), [85, 255, 255, 255]);
        
        let mask = new cv.Mat();
        cv.inRange(hsv, lower_green, upper_green, mask);
        
        // Morphological close to connect small broken green parts
        let closeKernel = cv.Mat.ones(5, 5, cv.CV_8U);
        cv.morphologyEx(mask, mask, cv.MORPH_CLOSE, closeKernel);
        
        let clean_mask = new cv.Mat.zeros(mask.rows, mask.cols, cv.CV_8U);
        let maskData = mask.data;
        let cleanData = clean_mask.data;
        let width = mask.cols;
        let height = mask.rows;
        
        let queue = new Int32Array(width * height);
        let qHead = 0;
        let qTail = 0;
        
        // Seed the queue with border pixels
        for (let x = 0; x < width; x++) {
            if (maskData[x] === 255) { queue[qTail++] = x; cleanData[x] = 255; }
            let botIdx = (height - 1) * width + x;
            if (maskData[botIdx] === 255) { queue[qTail++] = botIdx; cleanData[botIdx] = 255; }
        }
        for (let y = 0; y < height; y++) {
            let leftIdx = y * width;
            if (maskData[leftIdx] === 255 && cleanData[leftIdx] === 0) { queue[qTail++] = leftIdx; cleanData[leftIdx] = 255; }
            let rightIdx = y * width + width - 1;
            if (maskData[rightIdx] === 255 && cleanData[rightIdx] === 0) { queue[qTail++] = rightIdx; cleanData[rightIdx] = 255; }
        }
        
        // Flood fill BFS
        while (qHead < qTail) {
            let idx = queue[qHead++];
            let x = idx % width;
            let y = Math.floor(idx / width);
            
            if (x > 0) {
                let n = idx - 1;
                if (maskData[n] === 255 && cleanData[n] === 0) { cleanData[n] = 255; queue[qTail++] = n; }
            }
            if (x < width - 1) {
                let n = idx + 1;
                if (maskData[n] === 255 && cleanData[n] === 0) { cleanData[n] = 255; queue[qTail++] = n; }
            }
            if (y > 0) {
                let n = idx - width;
                if (maskData[n] === 255 && cleanData[n] === 0) { cleanData[n] = 255; queue[qTail++] = n; }
            }
            if (y < height - 1) {
                let n = idx + width;
                if (maskData[n] === 255 && cleanData[n] === 0) { cleanData[n] = 255; queue[qTail++] = n; }
            }
        }
        
        // Dilate the clean border mask to remove the green halo
        let kernel = cv.Mat.ones(5, 5, cv.CV_8U);
        cv.dilate(clean_mask, clean_mask, kernel, new cv.Point(-1, -1), 2);
        
        let mask_inv = new cv.Mat();
        cv.bitwise_not(clean_mask, mask_inv);
        
        let white_bg = new cv.Mat(dst.rows, dst.cols, dst.type(), [255, 255, 255, 255]);
        
        let fg = new cv.Mat();
        cv.bitwise_and(dst, dst, fg, mask_inv);
        
        let bg = new cv.Mat();
        cv.bitwise_and(white_bg, white_bg, bg, clean_mask);
        
        cv.add(fg, bg, dst);
        
        hsv.delete(); lower_green.delete(); upper_green.delete(); mask.delete(); closeKernel.delete();
        clean_mask.delete(); mask_inv.delete(); white_bg.delete(); fg.delete(); bg.delete(); kernel.delete();
    }
    
    if (appState[side].isBlackAndWhite) {
        cv.cvtColor(dst, dst, cv.COLOR_RGBA2GRAY, 0);
    }
    
    cv.imshow(canvasOutput, dst);
    
    let ctx = canvasOutput.getContext('2d');
    
    // 1. First make the corners transparent using destination-in
    ctx.globalCompositeOperation = 'destination-in';
    ctx.beginPath();
    
    // Standard IC corner radius is ~3.7% of its width
    let radius = canvasOutput.width * 0.037; 
    ctx.moveTo(radius, 0);
    ctx.lineTo(canvasOutput.width - radius, 0);
    ctx.quadraticCurveTo(canvasOutput.width, 0, canvasOutput.width, radius);
    ctx.lineTo(canvasOutput.width, canvasOutput.height - radius);
    ctx.quadraticCurveTo(canvasOutput.width, canvasOutput.height, canvasOutput.width - radius, canvasOutput.height);
    ctx.lineTo(radius, canvasOutput.height);
    ctx.quadraticCurveTo(0, canvasOutput.height, 0, canvasOutput.height - radius);
    ctx.lineTo(0, radius);
    ctx.quadraticCurveTo(0, 0, radius, 0);
    ctx.closePath();
    ctx.fill();
    
    // 2. Now fill those transparent corners with solid white so JPEG export doesn't turn them black!
    ctx.globalCompositeOperation = 'destination-over';
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvasOutput.width, canvasOutput.height);
    
    ctx.globalCompositeOperation = 'source-over';
    
    dst.delete();
}

async function handleFile(file, side) {
    if (!cvReady) {
        showStatus('Please wait for OpenCV to finish loading.', 'error');
        return;
    }

    loadingText.textContent = `Processing ${side} IC...`;
    loadingOverlay.classList.add('active');
    
    document.getElementById(`uploadSection-${side}`).style.display = 'block';
    document.getElementById(`resultsSection-${side}`).classList.remove('active');

    try {
        let isImage = file.type.startsWith('image/') || file.name.match(/\.(jpg|jpeg|png|gif|webp)$/i);
        let isPdf = file.type === 'application/pdf' || file.name.match(/\.pdf$/i);

        if (isPdf) {
            await processPDF(file, side);
        } else if (isImage) {
            await processImage(file, side);
        } else {
            showStatus('Unsupported file format.', 'error');
            loadingOverlay.classList.remove('active');
            return;
        }
    } catch (error) {
        console.error(error);
        showStatus('Error processing file.', 'error');
        loadingOverlay.classList.remove('active');
    }
}

async function processPDF(file, side) {
    const fileReader = new FileReader();
    const canvasInput = document.getElementById(`canvasInput-${side}`);
    fileReader.onload = async function() {
        const typedarray = new Uint8Array(this.result);
        const pdf = await pdfjsLib.getDocument(typedarray).promise;
        const page = await pdf.getPage(1);
        
        const scale = 2.0;
        const viewport = page.getViewport({ scale: scale });
        
        canvasInput.width = viewport.width;
        canvasInput.height = viewport.height;
        
        const renderContext = {
            canvasContext: canvasInput.getContext('2d'),
            viewport: viewport
        };
        
        await page.render(renderContext).promise;
        appState[side].originalImgImage = null;
        processCanvasWithOpenCV(side);
    };
    fileReader.readAsArrayBuffer(file);
}

function processImage(file, side) {
    return new Promise((resolve, reject) => {
        const canvasInput = document.getElementById(`canvasInput-${side}`);
        const reader = new FileReader();
        reader.onload = (event) => {
            const img = new Image();
            img.onload = () => {
                let width = img.width;
                let height = img.height;
                const MAX_DIM = 2000;
                
                if (width > MAX_DIM || height > MAX_DIM) {
                    const ratio = Math.min(MAX_DIM / width, MAX_DIM / height);
                    width = Math.round(width * ratio);
                    height = Math.round(height * ratio);
                }
                
                canvasInput.width = width;
                canvasInput.height = height;
                const ctx = canvasInput.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                appState[side].originalImgImage = img;
                processCanvasWithOpenCV(side);
                resolve();
            };
            img.onerror = reject;
            img.src = event.target.result;
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

function orderPoints(pts) {
    let s = pts.map(p => p.x + p.y);
    let diff = pts.map(p => p.y - p.x);
    
    let tl = pts[s.indexOf(Math.min(...s))];
    let br = pts[s.indexOf(Math.max(...s))];
    let tr = pts[diff.indexOf(Math.min(...diff))];
    let bl = pts[diff.indexOf(Math.max(...diff))];
    
    return [tl, tr, br, bl];
}

function scoreFrontIC(pts, src) {
    // Warp Perspective
    let targetW = 890;
    let targetH = 560;
    let dX = pts[1].x - pts[0].x;
    let dY = pts[1].y - pts[0].y;
    let len1 = Math.sqrt(dX*dX + dY*dY);
    let len2 = Math.sqrt(Math.pow(pts[3].x - pts[0].x, 2) + Math.pow(pts[3].y - pts[0].y, 2));
    if (len2 > len1) { targetW = 560; targetH = 890; }
    
    let srcTri = cv.matFromArray(4, 1, cv.CV_32FC2, [pts[0].x, pts[0].y, pts[1].x, pts[1].y, pts[2].x, pts[2].y, pts[3].x, pts[3].y]);
    let dstTri = cv.matFromArray(4, 1, cv.CV_32FC2, [0, 0, targetW, 0, targetW, targetH, 0, targetH]);
    let M = cv.getPerspectiveTransform(srcTri, dstTri);
    let warped = new cv.Mat();
    cv.warpPerspective(src, warped, M, new cv.Size(targetW, targetH), cv.INTER_LINEAR);

    // Edge Density
    let gray = new cv.Mat();
    cv.cvtColor(warped, gray, cv.COLOR_RGBA2GRAY, 0);
    let edges = new cv.Mat();
    cv.Canny(gray, edges, 100, 200);
    let edgeDensity = cv.countNonZero(edges) / (targetW * targetH);
    
    // Yellow Pixel Density (Chip)
    let hsv = new cv.Mat();
    cv.cvtColor(warped, hsv, cv.COLOR_RGBA2RGB);
    cv.cvtColor(hsv, hsv, cv.COLOR_RGB2HSV);
    let lowerYellow = new cv.Mat(hsv.rows, hsv.cols, hsv.type(), [20, 100, 100, 0]);
    let upperYellow = new cv.Mat(hsv.rows, hsv.cols, hsv.type(), [40, 255, 255, 255]);
    let mask = new cv.Mat();
    cv.inRange(hsv, lowerYellow, upperYellow, mask);
    let yellowDensity = cv.countNonZero(mask) / (targetW * targetH);

    srcTri.delete(); dstTri.delete(); M.delete(); warped.delete();
    gray.delete(); edges.delete(); hsv.delete(); lowerYellow.delete(); upperYellow.delete(); mask.delete();

    return (edgeDensity * 100) + (yellowDensity * 1000);
}

function processCanvasWithOpenCV(side) {
    const canvasInput = document.getElementById(`canvasInput-${side}`);
    try {
        let src = cv.imread(canvasInput);
        let gray = new cv.Mat();
        let blurred = new cv.Mat();
        let edges = new cv.Mat();

        cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY, 0);
        cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0, 0, cv.BORDER_DEFAULT);
        cv.Canny(blurred, edges, 75, 200, 3, false);

        let contours = new cv.MatVector();
        let hierarchy = new cv.Mat();
        cv.findContours(edges, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

        let validContours = [];
        let minArea = src.rows * src.cols * 0.05;

        for (let i = 0; i < contours.size(); ++i) {
            let cnt = contours.get(i);
            let area = cv.contourArea(cnt);
            if (area > minArea) {
                let approx = new cv.Mat();
                let peri = cv.arcLength(cnt, true);
                cv.approxPolyDP(cnt, approx, 0.02 * peri, true);
                
                if (approx.rows === 4) {
                    validContours.push(approx.clone());
                }
                approx.delete();
            }
        }

        gray.delete(); blurred.delete(); edges.delete();
        contours.delete(); hierarchy.delete();

        validContours.sort((a, b) => cv.contourArea(b) - cv.contourArea(a));
        
        let parsePts = (contour) => {
            let ptsArray = [];
            for (let i = 0; i < 4; i++) {
                ptsArray.push({
                    x: contour.data32S[i * 2],
                    y: contour.data32S[i * 2 + 1]
                });
            }
            let orderedPts = orderPoints(ptsArray);
            let cx = (orderedPts[0].x + orderedPts[1].x + orderedPts[2].x + orderedPts[3].x) / 4;
            let cy = (orderedPts[0].y + orderedPts[1].y + orderedPts[2].y + orderedPts[3].y) / 4;
            let scaleFactor = 1.02;
            for (let i = 0; i < 4; i++) {
                orderedPts[i].x = cx + (orderedPts[i].x - cx) * scaleFactor;
                orderedPts[i].y = cy + (orderedPts[i].y - cy) * scaleFactor;
            }
            return orderedPts;
        };

        if (validContours.length === 0) {
            showStatus('Could not detect boundary automatically. We have placed default handles for you to adjust.', 'error');
            let w = canvasInput.width;
            let h = canvasInput.height;
            appState[side].cropPoints = [
                {x: w*0.1, y: h*0.1}, {x: w*0.9, y: h*0.1},
                {x: w*0.9, y: h*0.9}, {x: w*0.1, y: h*0.9}
            ];
            
            if (appState[side].currentSrcMat) appState[side].currentSrcMat.delete();
            appState[side].currentSrcMat = src.clone();
            drawInputCanvas(side);
            
            document.getElementById(`uploadSection-${side}`).style.display = 'none';
            document.getElementById(`resultsSection-${side}`).classList.add('active');
            
        } else if (validContours.length === 1 || side === 'back') {
            appState[side].cropPoints = parsePts(validContours[0]);
            
            if (appState[side].currentSrcMat) appState[side].currentSrcMat.delete();
            appState[side].currentSrcMat = src.clone();
            drawInputCanvas(side);
            
            document.getElementById(`uploadSection-${side}`).style.display = 'none';
            document.getElementById(`resultsSection-${side}`).classList.add('active');
            showStatus('Boundary detected! Drag the corners to adjust, then click Apply Crop.', 'success');
            
        } else {
            // Magic Multi-Card Detection
            let pts1 = parsePts(validContours[0]);
            let pts2 = parsePts(validContours[1]);
            
            let score1 = scoreFrontIC(pts1, src);
            let score2 = scoreFrontIC(pts2, src);
            
            let frontPts, backPts;
            if (score1 >= score2) {
                frontPts = pts1;
                backPts = pts2;
            } else {
                frontPts = pts2;
                backPts = pts1;
            }
            
            appState.front.cropPoints = frontPts;
            if (appState.front.currentSrcMat) appState.front.currentSrcMat.delete();
            appState.front.currentSrcMat = src.clone();
            
            appState.back.cropPoints = backPts;
            appState.back.originalImgImage = appState.front.originalImgImage;
            if (appState.back.currentSrcMat) appState.back.currentSrcMat.delete();
            appState.back.currentSrcMat = src.clone();
            
            drawInputCanvas('front');
            document.getElementById('uploadSection-front').style.display = 'none';
            document.getElementById('resultsSection-front').classList.add('active');
            
            const canvasInputBack = document.getElementById('canvasInput-back');
            canvasInputBack.width = canvasInput.width;
            canvasInputBack.height = canvasInput.height;
            const ctxBack = canvasInputBack.getContext('2d');
            if (appState.back.originalImgImage) {
                ctxBack.drawImage(appState.back.originalImgImage, 0, 0, canvasInputBack.width, canvasInputBack.height);
            } else {
                cv.imshow(canvasInputBack, src);
            }
            drawInputCanvas('back');
            
            document.getElementById('uploadSection-back').style.display = 'none';
            document.getElementById('resultsSection-back').classList.add('active');
            
            performFinalCrop('front');
            performFinalCrop('back');
            
            showStatus('AI successfully recognized Front & Back IC! Both have been auto-processed.', 'success');
        }

        for(let i = 0; i < validContours.length; i++){
            validContours[i].delete();
        }
        src.delete();
        
    } catch (e) {
        console.error(e);
        showStatus('Error during image processing.', 'error');
    }
    
    loadingOverlay.classList.remove('active');
}

function performFinalCrop(side) {
    if (appState[side].cropPoints.length !== 4 || !appState[side].currentSrcMat) return;
    
    try {
        let pts = appState[side].cropPoints;
        let src = appState[side].currentSrcMat;
        
        // Target high-resolution size for clear output
        const targetW = 2580;
        const targetH = 1620;
        
        let dX1 = pts[1].x - pts[0].x;
        let dY1 = pts[1].y - pts[0].y;
        let dX2 = pts[3].x - pts[0].x;
        let dY2 = pts[3].y - pts[0].y;
        
        let len1 = Math.sqrt(dX1*dX1 + dY1*dY1);
        let len2 = Math.sqrt(dX2*dX2 + dY2*dY2);
        
        let finalW = targetW;
        let finalH = targetH;
        
        if (len2 > len1) {
            finalW = targetH;
            finalH = targetW;
        }

        let srcTri = cv.matFromArray(4, 1, cv.CV_32FC2, [
            pts[0].x, pts[0].y,
            pts[1].x, pts[1].y,
            pts[2].x, pts[2].y,
            pts[3].x, pts[3].y
        ]);
        
        let dstTri = cv.matFromArray(4, 1, cv.CV_32FC2, [
            0, 0,
            finalW, 0,
            finalW, finalH,
            0, finalH
        ]);

        let M = cv.getPerspectiveTransform(srcTri, dstTri);
        let dst = new cv.Mat();
        
        cv.warpPerspective(src, dst, M, new cv.Size(finalW, finalH), cv.INTER_LINEAR, cv.BORDER_CONSTANT, new cv.Scalar(255, 255, 255, 255));

        if (appState[side].currentCroppedMat) {
            appState[side].currentCroppedMat.delete();
        }
        appState[side].currentCroppedMat = dst.clone();
        appState[side].hasResult = true;
        
        // Reset adjustments when performing a new crop
        document.getElementById(`brightnessSlider-${side}`).value = 100;
        document.getElementById(`brightnessValue-${side}`).textContent = "100";
        document.getElementById(`contrastSlider-${side}`).value = 100;
        document.getElementById(`contrastValue-${side}`).textContent = "100";
        
        applyFilters(side);

        srcTri.delete(); dstTri.delete(); M.delete(); dst.delete();
        
    } catch (e) {
        console.error(e);
        showStatus('Error during crop processing.', 'error');
    }
}

// Global Export Actions
document.getElementById('btnDownloadPNGs').addEventListener('click', () => {
    if (!appState.front.hasResult && !appState.back.hasResult) {
        showStatus('Please process at least one side of the IC first.', 'error');
        return;
    }
    
    if (appState.front.hasResult) {
        const link = document.createElement('a');
        link.download = 'cropped-ic-front.png';
        link.href = document.getElementById('canvasOutput-front').toDataURL('image/png');
        link.click();
    }
    
    setTimeout(() => {
        if (appState.back.hasResult) {
            const link = document.createElement('a');
            link.download = 'cropped-ic-back.png';
            link.href = document.getElementById('canvasOutput-back').toDataURL('image/png');
            link.click();
        }
    }, 500); // Slight delay for multiple downloads
});

document.getElementById('btnExportPDF').addEventListener('click', () => {
    if (!appState.front.hasResult && !appState.back.hasResult) {
        showStatus('Please process at least one side of the IC first to export PDF.', 'error');
        return;
    }
    
    // Create an A4 PDF portrait
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
    });
    
    // A4 size is 210 x 297 mm
    // Malaysian IC standard size is 89mm x 546mm
    const icWidth = 89;
    const icHeight = 56;
    
    // Center alignment
    const xPos = (210 - icWidth) / 2;
    
    if (appState.front.hasResult) {
        const frontData = document.getElementById('canvasOutput-front').toDataURL('image/jpeg', 1.0);
        // Place front IC near the top (e.g. 50mm down)
        doc.addImage(frontData, 'JPEG', xPos, 50, icWidth, icHeight);
    }
    
    if (appState.back.hasResult) {
        const backData = document.getElementById('canvasOutput-back').toDataURL('image/jpeg', 1.0);
        // Place back IC below it (e.g. 150mm down)
        doc.addImage(backData, 'JPEG', xPos, 150, icWidth, icHeight);
    }
    
    doc.save('Identity_Card.pdf');
    showStatus('PDF exported successfully!', 'success');
});

// --- Camera Logic ---

document.getElementById('btnCloseCamera').addEventListener('click', stopCamera);

document.getElementById('btnCaptureCamera').addEventListener('click', () => {
    if (!stream) return;
    
    const ctx = cameraCanvas.getContext('2d');
    ctx.drawImage(cameraVideo, 0, 0, cameraCanvas.width, cameraCanvas.height);
    
    stopCamera();
    
    loadingText.textContent = `Processing ${currentCameraSide} IC...`;
    loadingOverlay.classList.add('active');
    
    const img = new Image();
    img.onload = () => {
        const inputCanvas = document.getElementById(`canvasInput-${currentCameraSide}`);
        inputCanvas.width = img.width;
        inputCanvas.height = img.height;
        const inputCtx = inputCanvas.getContext('2d');
        inputCtx.drawImage(img, 0, 0, img.width, img.height);
        
        appState[currentCameraSide].originalImgImage = img;
        
        setTimeout(() => {
            processCanvasWithOpenCV(currentCameraSide);
        }, 50);
    };
    img.src = cameraCanvas.toDataURL('image/jpeg', 1.0);
});

function startCamera(side) {
    currentCameraSide = side;
    cameraModal.classList.add('active');
    cameraStatus.textContent = "Initializing camera...";
    cameraStatus.className = "camera-status warning";
    
    navigator.mediaDevices.getUserMedia({ 
        video: { 
            facingMode: 'environment',
            width: { ideal: 1920 },
            height: { ideal: 1080 }
        } 
    })
    .then(s => {
        stream = s;
        cameraVideo.srcObject = stream;
        cameraVideo.onloadedmetadata = () => {
            cameraVideo.play();
            cameraCanvas.width = cameraVideo.videoWidth;
            cameraCanvas.height = cameraVideo.videoHeight;
            processCameraFrame();
        };
    })
    .catch(err => {
        console.error(err);
        alert("Could not access camera. Please ensure permissions are granted.");
        stopCamera();
    });
}

function stopCamera() {
    if (stream) {
        stream.getTracks().forEach(track => track.stop());
        stream = null;
    }
    if (cameraLoopId) {
        cancelAnimationFrame(cameraLoopId);
        cameraLoopId = null;
    }
    cameraModal.classList.remove('active');
}

function processCameraFrame() {
    if (!stream || !cvReady || !cameraVideo.videoWidth) {
        if (stream) cameraLoopId = requestAnimationFrame(processCameraFrame);
        return;
    }
    
    try {
        const ctx = cameraCanvas.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(cameraVideo, 0, 0, cameraCanvas.width, cameraCanvas.height);
        
        let src = cv.imread(cameraCanvas);
        let gray = new cv.Mat();
        cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY, 0);
        
        // Blur Detection using Laplacian Variance
        let lap = new cv.Mat();
        cv.Laplacian(gray, lap, cv.CV_64F);
        let mean = new cv.Mat();
        let stddev = new cv.Mat();
        cv.meanStdDev(lap, mean, stddev);
        let variance = stddev.data64F[0] * stddev.data64F[0];
        
        // Glare/Shadow Detection
        let hist = new cv.Mat();
        let mask = new cv.Mat();
        let histSize = [256];
        let ranges = [0, 256];
        cv.calcHist([gray], [0], mask, hist, histSize, ranges);
        
        let totalPixels = gray.rows * gray.cols;
        let shadowPixels = 0;
        let glarePixels = 0;
        
        for (let i = 0; i < 20; i++) shadowPixels += hist.data32F[i];
        for (let i = 240; i < 256; i++) glarePixels += hist.data32F[i];
        
        let shadowRatio = shadowPixels / totalPixels;
        let glareRatio = glarePixels / totalPixels;
        
        if (variance < 80) {
            cameraStatus.textContent = "Hold steady - Image is blurry";
            cameraStatus.className = "camera-status warning";
        } else if (glareRatio > 0.05) {
            cameraStatus.textContent = "Glare detected - Move away from direct light";
            cameraStatus.className = "camera-status warning";
        } else if (shadowRatio > 0.3) {
            cameraStatus.textContent = "Too dark - Needs more light";
            cameraStatus.className = "camera-status warning";
        } else {
            cameraStatus.textContent = "Image is clear - Ready to capture!";
            cameraStatus.className = "camera-status success";
        }
        
        src.delete(); gray.delete(); lap.delete(); mean.delete(); stddev.delete();
        hist.delete(); mask.delete();
        
    } catch (e) {
        // Ignore errors to keep loop alive
    }
    
    setTimeout(() => {
        if (stream) cameraLoopId = requestAnimationFrame(processCameraFrame);
    }, 150);
}
