/* script.js - Jewels-Ai: Direct Download + Drive Sync (Updated URL) */

/* --- CONFIGURATION --- */
const API_KEY = "AIzaSyAXG3iG2oQjUA_BpnO8dK8y-MHJ7HLrhyE"; 

// [UPDATED] Your New Web App URL
const UPLOAD_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwZOFpJ3vtdaWBw4WIkoq80UsGTh85yGPEOWrzYyUG1e6wbm7cjjTbk6JzqvOMSDdT5Vg/exec";

const DRIVE_FOLDERS = {
  earrings: "1ySHR6Id5RxVj16-lf7NMN9I61RPySY9s",
  chains: "1G136WEiA9QBSLtRk0LW1fRb3HDZb4VBD",
  rings: "1iB1qgTE-Yl7w-CVsegecniD_DzklQk90",
  bangles: "1d2b7I8XlhIEb8S_eXnRFBEaNYSwngnba"
};

/* --- ASSETS & STATE --- */
const JEWELRY_ASSETS = {};
const PRELOADED_IMAGES = {}; 
const watermarkImg = new Image(); watermarkImg.src = 'logo_watermark.png'; 

/* DOM Elements */
const videoElement = document.getElementById('webcam');
const canvasElement = document.getElementById('overlay');
const canvasCtx = canvasElement.getContext('2d');
const loadingStatus = document.getElementById('loading-status');
const flashOverlay = document.getElementById('flash-overlay'); 

/* App State */
let earringImg = null, necklaceImg = null, ringImg = null, bangleImg = null;
let currentType = ''; 
let isProcessingHand = false, isProcessingFace = false;
let lastGestureTime = 0;
const GESTURE_COOLDOWN = 800; 
let previousHandX = null;     

/* Tracking Variables */
const sessionStartTime = Date.now(); 
let currentAssetName = "Default Design"; 

/* Camera State */
let currentCameraMode = 'user'; 

/* Gallery State */
let currentLightboxIndex = 0;
let autoSnapshots = [];
let currentPreviewData = { url: null, name: 'Jewels-Ai_look.png' }; 

/* Stabilizer Variables */
const SMOOTH_FACTOR = 0.8; 
let handSmoother = {
    active: false,
    ring: { x: 0, y: 0, angle: 0, size: 0 },
    bangle: { x: 0, y: 0, angle: 0, size: 0 }
};

let physics = { earringVelocity: 0, earringAngle: 0 };

/* --- HELPER: LERP --- */
function lerp(start, end, amt) {
    return (1 - amt) * start + amt * end;
}

/* --- 1. FLASH EFFECT --- */
function triggerFlash() {
    if(!flashOverlay) return;
    flashOverlay.classList.remove('flash-active'); 
    void flashOverlay.offsetWidth; 
    flashOverlay.classList.add('flash-active');
    setTimeout(() => { flashOverlay.classList.remove('flash-active'); }, 300);
}

/* --- 2. GOOGLE DRIVE ASSET FETCHING --- */
async function fetchFromDrive(category) {
    if (JEWELRY_ASSETS[category]) return;
    const folderId = DRIVE_FOLDERS[category];
    if (!folderId) return;
    
    if(videoElement.paused) {
        loadingStatus.style.display = 'block'; 
        loadingStatus.textContent = "Fetching Designs...";
    }
    
    try {
        const query = `'${folderId}' in parents and trashed = false and mimeType contains 'image/'`;
        const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name,thumbnailLink)&key=${API_KEY}`;
        const response = await fetch(url);
        const data = await response.json();
        if (data.error) throw new Error(data.error.message);
        JEWELRY_ASSETS[category] = data.files.map(file => {
            const src = file.thumbnailLink ? file.thumbnailLink.replace(/=s\d+$/, "=s3000") : `https://drive.google.com/uc?export=view&id=${file.id}`;
            return { id: file.id, name: file.name, src: src };
        });
    } catch (err) { 
        console.error("Drive Error:", err); 
        loadingStatus.style.display = 'none'; 
    }
}

async function preloadCategory(type) {
    await fetchFromDrive(type);
    if (!JEWELRY_ASSETS[type]) { loadingStatus.style.display = 'none'; return; }
    if (!PRELOADED_IMAGES[type]) {
        PRELOADED_IMAGES[type] = [];
        const promises = JEWELRY_ASSETS[type].map(file => {
            return new Promise((resolve) => {
                const img = new Image(); img.crossOrigin = 'anonymous'; 
                img.onload = () => resolve(img); img.onerror = () => resolve(null); 
                img.src = file.src; PRELOADED_IMAGES[type].push(img);
            });
        });
        if(videoElement.paused) loadingStatus.textContent = "Downloading Assets...";
        await Promise.all(promises); 
    }
    loadingStatus.style.display = 'none';
}

/* --- 3. DOWNLOAD & DATA CAPTURE LOGIC (NO WHATSAPP) --- */

// A. Open the Modal (Asking for Phone)
function requestDownload() {
    // Show the modal to ask for phone number
    const modal = document.getElementById('whatsapp-modal'); // Reusing existing modal ID
    if(modal) {
        modal.style.display = 'flex';
        // Change button text to "Download"
        const btn = modal.querySelector('button');
        if(btn) btn.innerText = "Download Now";
    }
}

// B. Close Modal
function closeWhatsAppModal() { 
    document.getElementById('whatsapp-modal').style.display = 'none'; 
}

// C. The Action: Download + Save to Sheet
function confirmDownload() {
    const phoneInput = document.getElementById('user-phone');
    const phone = phoneInput.value.trim();
    
    if (phone.length < 5) { 
        alert("Please enter a valid phone number to download."); 
        return; 
    }

    // 1. Close Modal
    document.getElementById('whatsapp-modal').style.display = 'none';
    
    // 2. Show Processing Overlay
    const overlay = document.getElementById('process-overlay');
    if(overlay) {
        overlay.style.display = 'flex'; 
        document.getElementById('process-text').innerText = "Downloading...";
    }

    // 3. Trigger Download to Device (Browser Download)
    saveAs(currentPreviewData.url, currentPreviewData.name);

    // 4. Send Data to Google Sheet (Background)
    uploadToDriveAndSheet(phone);

    // 5. Hide Overlay after delay
    setTimeout(() => { 
        if(overlay) overlay.style.display = 'none'; 
    }, 2000);
}

// D. Upload Function
function uploadToDriveAndSheet(phone) {
    const sessionDuration = Math.round((Date.now() - sessionStartTime) / 1000); 

    const payload = {
        phone: phone,
        image: currentPreviewData.url, // Sending full base64
        filename: currentPreviewData.name,
        duration: sessionDuration,
        photosCount: autoSnapshots.length,
        itemsViewed: currentAssetName,
        category: currentType
    };

    // Send to Google Script
    fetch(UPLOAD_SCRIPT_URL, {
        method: 'POST', 
        mode: 'no-cors', 
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    })
    .then(() => console.log("Upload success"))
    .catch(err => console.error("Upload failed", err));
}

/* --- 4. PHYSICS & AI CORE --- */
function calculateAngle(p1, p2) { return Math.atan2(p2.y - p1.y, p2.x - p1.x); }

const hands = new Hands({ locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}` });
hands.setOptions({ maxNumHands: 1, modelComplexity: 1, minDetectionConfidence: 0.5, minTrackingConfidence: 0.5 });

hands.onResults((results) => {
  isProcessingHand = false; 
  const w = canvasElement.width; const h = canvasElement.height;
  canvasCtx.save(); 

  if (currentCameraMode === 'environment') {
      canvasCtx.translate(0, 0); canvasCtx.scale(1, 1); 
  } else {
      canvasCtx.translate(w, 0); canvasCtx.scale(-1, 1);
  }

  if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
      const lm = results.multiHandLandmarks[0];
      const mcp = { x: lm[13].x * w, y: lm[13].y * h }; 
      const pip = { x: lm[14].x * w, y: lm[14].y * h };
      const targetRingAngle = calculateAngle(mcp, pip) - (Math.PI / 2);
      const dist = Math.hypot(pip.x - mcp.x, pip.y - mcp.y);
      const targetRingWidth = dist * 0.6; 

      const wrist = { x: lm[0].x * w, y: lm[0].y * h }; 
      const pinkyMcp = { x: lm[17].x * w, y: lm[17].y * h };
      const indexMcp = { x: lm[5].x * w, y: lm[5].y * h };
      const wristWidth = Math.hypot(pinkyMcp.x - indexMcp.x, pinkyMcp.y - indexMcp.y);
      const targetArmAngle = calculateAngle(wrist, { x: lm[9].x * w, y: lm[9].y * h }) - (Math.PI / 2);
      const targetBangleWidth = wristWidth * 1.25; 

      if (!handSmoother.active) {
          handSmoother.ring = { x: mcp.x, y: mcp.y, angle: targetRingAngle, size: targetRingWidth };
          handSmoother.bangle = { x: wrist.x, y: wrist.y, angle: targetArmAngle, size: targetBangleWidth };
          handSmoother.active = true;
      } else {
          handSmoother.ring.x = lerp(handSmoother.ring.x, mcp.x, SMOOTH_FACTOR);
          handSmoother.ring.y = lerp(handSmoother.ring.y, mcp.y, SMOOTH_FACTOR);
          handSmoother.ring.angle = lerp(handSmoother.ring.angle, targetRingAngle, SMOOTH_FACTOR);
          handSmoother.ring.size = lerp(handSmoother.ring.size, targetRingWidth, SMOOTH_FACTOR);

          handSmoother.bangle.x = lerp(handSmoother.bangle.x, wrist.x, SMOOTH_FACTOR);
          handSmoother.bangle.y = lerp(handSmoother.bangle.y, wrist.y, SMOOTH_FACTOR);
          handSmoother.bangle.angle = lerp(handSmoother.bangle.angle, targetArmAngle, SMOOTH_FACTOR);
          handSmoother.bangle.size = lerp(handSmoother.bangle.size, targetBangleWidth, SMOOTH_FACTOR);
      }

      if (ringImg && ringImg.complete) {
          const rHeight = (ringImg.height / ringImg.width) * handSmoother.ring.size;
          canvasCtx.save(); 
          canvasCtx.translate(handSmoother.ring.x, handSmoother.ring.y); 
          canvasCtx.rotate(handSmoother.ring.angle); 
          const currentDist = handSmoother.ring.size / 0.6;
          canvasCtx.drawImage(ringImg, -handSmoother.ring.size/2, currentDist * 0.15, handSmoother.ring.size, rHeight); 
          canvasCtx.restore();
      }

      if (bangleImg && bangleImg.complete) {
          const bHeight = (bangleImg.height / bangleImg.width) * handSmoother.bangle.size;
          canvasCtx.save(); 
          canvasCtx.translate(handSmoother.bangle.x, handSmoother.bangle.y); 
          canvasCtx.rotate(handSmoother.bangle.angle);
          canvasCtx.drawImage(bangleImg, -handSmoother.bangle.size/2, -bHeight/2, handSmoother.bangle.size, bHeight); 
          canvasCtx.restore();
      }
      
      const now = Date.now();
      if (now - lastGestureTime > GESTURE_COOLDOWN) {
          const indexTip = lm[8]; 
          if (previousHandX !== null) {
              const diff = indexTip.x - previousHandX;
              if (Math.abs(diff) > 0.04) { navigateJewelry(diff < 0 ? 1 : -1); lastGestureTime = now; previousHandX = null; }
          }
          if (now - lastGestureTime > 100) previousHandX = indexTip.x;
      }
  } else { 
      previousHandX = null; handSmoother.active = false; 
  }
  canvasCtx.restore();
});

const faceMesh = new FaceMesh({ locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}` });
faceMesh.setOptions({ refineLandmarks: true, minDetectionConfidence: 0.5, minTrackingConfidence: 0.5 });
faceMesh.onResults((results) => {
  isProcessingFace = false; if(loadingStatus.style.display !== 'none') loadingStatus.style.display = 'none';
  canvasElement.width = videoElement.videoWidth; canvasElement.height = videoElement.videoHeight;
  canvasCtx.save(); canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
  canvasCtx.translate(canvasElement.width, 0); canvasCtx.scale(-1, 1);

  if (results.multiFaceLandmarks && results.multiFaceLandmarks[0]) {
    const lm = results.multiFaceLandmarks[0]; const w = canvasElement.width; const h = canvasElement.height;
    const leftEar = { x: lm[132].x * w, y: lm[132].y * h }; const rightEar = { x: lm[361].x * w, y: lm[361].y * h };
    const neck = { x: lm[152].x * w, y: lm[152].y * h }; const nose = { x: lm[1].x * w, y: lm[1].y * h };

    const rawHeadTilt = Math.atan2(rightEar.y - leftEar.y, rightEar.x - leftEar.x);
    const gravityTarget = -rawHeadTilt; const force = (gravityTarget - physics.earringAngle) * 0.08; 
    physics.earringVelocity += force; physics.earringVelocity *= 0.95; physics.earringAngle += physics.earringVelocity;
    const earDist = Math.hypot(rightEar.x - leftEar.x, rightEar.y - leftEar.y);

    if (earringImg && earringImg.complete) {
      let ew = earDist * 0.25; let eh = (earringImg.height/earringImg.width) * ew;
      const distToLeft = Math.hypot(nose.x - leftEar.x, nose.y - leftEar.y);
      const distToRight = Math.hypot(nose.x - rightEar.x, nose.y - rightEar.y);
      const ratio = distToLeft / (distToLeft + distToRight);
      const xShift = ew * 0.05; 
      if (ratio > 0.2) { 
          canvasCtx.save(); canvasCtx.translate(leftEar.x, leftEar.y); canvasCtx.rotate(physics.earringAngle); 
          canvasCtx.drawImage(earringImg, (-ew/2) - xShift, -eh * 0.20, ew, eh); canvasCtx.restore(); 
      }
      if (ratio < 0.8) { 
          canvasCtx.save(); canvasCtx.translate(rightEar.x, rightEar.y); canvasCtx.rotate(physics.earringAngle); 
          canvasCtx.drawImage(earringImg, (-ew/2) + xShift, -eh * 0.20, ew, eh); canvasCtx.restore(); 
      }
    }
    if (necklaceImg && necklaceImg.complete) {
      let nw = earDist * 0.85; let nh = (necklaceImg.height/necklaceImg.width) * nw;
      canvasCtx.drawImage(necklaceImg, neck.x - nw/2, neck.y + (earDist*0.1), nw, nh);
    }
  }
  canvasCtx.restore();
});

/* --- INITIALIZATION --- */
window.onload = async () => {
    await startCameraFast('user');
    setTimeout(() => { loadingStatus.style.display = 'none'; }, 5000);
    selectJewelryType('earrings');
};

/* --- UI HELPERS --- */
function navigateJewelry(dir) {
  if (!currentType || !PRELOADED_IMAGES[currentType]) return;
  const list = PRELOADED_IMAGES[currentType];
  let currentImg = (currentType === 'earrings') ? earringImg : (currentType === 'chains') ? necklaceImg : (currentType === 'rings') ? ringImg : bangleImg;
  let idx = list.indexOf(currentImg); if (idx === -1) idx = 0; 
  let nextIdx = (idx + dir + list.length) % list.length;
  const nextItem = list[nextIdx];
  
  if (currentType === 'earrings') earringImg = nextItem;
  else if (currentType === 'chains') necklaceImg = nextItem;
  else if (currentType === 'rings') ringImg = nextItem;
  else if (currentType === 'bangles') bangleImg = nextItem;

  if (JEWELRY_ASSETS[currentType] && JEWELRY_ASSETS[currentType][nextIdx]) {
      currentAssetName = JEWELRY_ASSETS[currentType][nextIdx].name;
  }
}

async function selectJewelryType(type) {
  currentType = type;
  const targetMode = (type === 'rings' || type === 'bangles') ? 'environment' : 'user';
  await startCameraFast(targetMode);

  if(type !== 'earrings') earringImg = null; if(type !== 'chains') necklaceImg = null;
  if(type !== 'rings') ringImg = null; if(type !== 'bangles') bangleImg = null;

  await preloadCategory(type); 
  if (PRELOADED_IMAGES[type] && PRELOADED_IMAGES[type].length > 0) {
      const firstItem = PRELOADED_IMAGES[type][0];
      if (type === 'earrings') earringImg = firstItem; else if (type === 'chains') necklaceImg = firstItem;
      else if (type === 'rings') ringImg = firstItem; else if (type === 'bangles') bangleImg = firstItem;
      if(JEWELRY_ASSETS[type] && JEWELRY_ASSETS[type][0]) currentAssetName = JEWELRY_ASSETS[type][0].name;
  }
  const container = document.getElementById('jewelry-options'); container.innerHTML = ''; container.style.display = 'flex';
  if (!JEWELRY_ASSETS[type]) return;

  JEWELRY_ASSETS[type].forEach((file, i) => {
    const btnImg = new Image(); btnImg.src = file.src; btnImg.crossOrigin = 'anonymous'; btnImg.className = "thumb-btn"; 
    if(i === 0) { btnImg.style.borderColor = "var(--accent)"; btnImg.style.transform = "scale(1.05)"; }
    btnImg.onclick = () => {
        Array.from(container.children).forEach(c => { c.style.borderColor = "rgba(255,255,255,0.2)"; c.style.transform = "scale(1)"; });
        btnImg.style.borderColor = "var(--accent)"; btnImg.style.transform = "scale(1.05)";
        const fullImg = PRELOADED_IMAGES[type][i];
        if (type === 'earrings') earringImg = fullImg; else if (type === 'chains') necklaceImg = fullImg;
        else if (type === 'rings') ringImg = fullImg; else if (type === 'bangles') bangleImg = fullImg;
        currentAssetName = file.name;
    };
    container.appendChild(btnImg);
  });
}

/* --- CAPTURE & GALLERY --- */
function captureToGallery() {
  const tempCanvas = document.createElement('canvas'); 
  tempCanvas.width = videoElement.videoWidth; 
  tempCanvas.height = videoElement.videoHeight;
  const tempCtx = tempCanvas.getContext('2d');
  
  if (currentCameraMode === 'environment') {
      tempCtx.translate(0, 0); tempCtx.scale(1, 1); 
  } else {
      tempCtx.translate(tempCanvas.width, 0); tempCtx.scale(-1, 1); 
  }

  tempCtx.drawImage(videoElement, 0, 0);
  tempCtx.setTransform(1, 0, 0, 1, 0, 0); 
  try { tempCtx.drawImage(canvasElement, 0, 0); } catch(e) {}
  
  // Overlay Code
  const productTitle = "Product Code: '25252'";
  const productDesc = "This exquisite gold earring features a unique triangular drop design...";
  const padding = tempCanvas.width * 0.04; 
  const titleSize = tempCanvas.width * 0.045; 
  const descSize = tempCanvas.width * 0.025; 
  const lineHeight = descSize * 1.4;
  
  tempCtx.font = `${descSize}px Montserrat, sans-serif`;
  const maxWidth = tempCanvas.width - (padding * 2);
  const words = productDesc.split(' ');
  let lines = []; let currentLine = words[0];
  for (let i = 1; i < words.length; i++) {
      const width = tempCtx.measureText(currentLine + " " + words[i]).width;
      if (width < maxWidth) currentLine += " " + words[i];
      else { lines.push(currentLine); currentLine = words[i]; }
  }
  lines.push(currentLine);

  const contentHeight = (titleSize * 1.5) + (titleSize * 0.5) + (lines.length * lineHeight) + padding;
  const gradient = tempCtx.createLinearGradient(0, tempCanvas.height - contentHeight - padding, 0, tempCanvas.height);
  gradient.addColorStop(0, "rgba(0,0,0,0)"); gradient.addColorStop(0.2, "rgba(0,0,0,0.8)"); gradient.addColorStop(1, "rgba(0,0,0,0.95)");
  tempCtx.fillStyle = gradient; tempCtx.fillRect(0, tempCanvas.height - contentHeight - padding, tempCanvas.width, contentHeight + padding);

  tempCtx.font = `bold ${titleSize}px Playfair Display, serif`; tempCtx.fillStyle = "#d4af37"; tempCtx.textAlign = "left"; tempCtx.textBaseline = "top";
  const titleY = tempCanvas.height - contentHeight; tempCtx.fillText(productTitle, padding, titleY);

  tempCtx.font = `${descSize}px Montserrat, sans-serif`; tempCtx.fillStyle = "#ffffff";
  lines.forEach((line, index) => { tempCtx.fillText(line, padding, titleY + (titleSize * 1.5) + (index * lineHeight)); });

  if (watermarkImg.complete) {
      const wWidth = tempCanvas.width * 0.25; const wHeight = (watermarkImg.height / watermarkImg.width) * wWidth;
      tempCtx.drawImage(watermarkImg, tempCanvas.width - wWidth - padding, padding, wWidth, wHeight);
  }
  
  const dataUrl = tempCanvas.toDataURL('image/png');
  const safeName = "Product_25252_Look";
  autoSnapshots.push({ url: dataUrl, name: `${safeName}_${Date.now()}.png` });
  return { url: dataUrl, name: `${safeName}_${Date.now()}.png` }; 
}

function takeSnapshot() { 
    triggerFlash(); const shotData = captureToGallery(); currentPreviewData = shotData; 
    document.getElementById('preview-image').src = shotData.url; document.getElementById('preview-modal').style.display = 'flex'; 
}

/* --- EXPORTS & MAPPING --- */
// 1. Remap the Download Button to open Modal instead of WhatsApp
window.downloadSingleSnapshot = requestDownload; 

// 2. Remap the "Confirm" button (if your HTML has onclick="confirmWhatsAppDownload()")
window.confirmWhatsAppDownload = confirmDownload; 

// 3. Close modal
window.closeWhatsAppModal = closeWhatsAppModal;

// Standard Exports
window.selectJewelryType = selectJewelryType; 
window.takeSnapshot = takeSnapshot;
window.closePreview = () => { document.getElementById('preview-modal').style.display = 'none'; };

async function startCameraFast(mode = 'user') {
    if (videoElement.srcObject && currentCameraMode === mode && videoElement.readyState >= 2) return;
    currentCameraMode = mode;
    loadingStatus.style.display = 'block';
    loadingStatus.textContent = mode === 'environment' ? "Switching to Back Camera..." : "Switching to Selfie Camera...";
    if (videoElement.srcObject) { videoElement.srcObject.getTracks().forEach(track => track.stop()); }
    if (mode === 'environment') { videoElement.classList.add('no-mirror'); } else { videoElement.classList.remove('no-mirror'); }

    try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
            video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: mode } 
        });
        videoElement.srcObject = stream;
        videoElement.onloadeddata = () => { videoElement.play(); loadingStatus.style.display = 'none'; detectLoop(); };
    } catch (err) { alert("Camera Error: " + err.message); loadingStatus.textContent = "Camera Error"; }
}

async function detectLoop() {
    if (videoElement.readyState >= 2) {
        if (!isProcessingFace) { isProcessingFace = true; await faceMesh.send({image: videoElement}); }
        if (!isProcessingHand) { isProcessingHand = true; await hands.send({image: videoElement}); }
    }
    requestAnimationFrame(detectLoop);
}