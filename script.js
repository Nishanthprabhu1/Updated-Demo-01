/* script.js - Jewels-Ai Atelier: Fixed Voice Recognition */

/* --- CONFIGURATION --- */
const API_KEY = "AIzaSyAXG3iG2oQjUA_BpnO8dK8y-MHJ7HLrhyE"; 

const DRIVE_FOLDERS = {
  earrings: "1eftKhpOHbCj8hzO11-KioFv03g0Yn61n",
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
const voiceBtn = document.getElementById('voice-btn'); // Mic Button

/* App State */
let earringImg = null, necklaceImg = null, ringImg = null, bangleImg = null;
let currentType = ''; 
let isProcessingHand = false, isProcessingFace = false;
let lastGestureTime = 0;
const GESTURE_COOLDOWN = 800; 
let previousHandX = null;     

/* Tracking Variables */
let currentAssetName = "Select a Design"; 

/* Camera State */
let currentCameraMode = 'user'; 

/* Gallery State */
let currentLightboxIndex = 0;

/* Voice State */
let recognition = null;
let voiceEnabled = true;
let isRecognizing = false;

/* Physics State */
let physics = { earringVelocity: 0, earringAngle: 0 };

/* Stabilizer Variables */
const SMOOTH_FACTOR = 0.8; 
let handSmoother = {
    active: false,
    ring: { x: 0, y: 0, angle: 0, size: 0 },
    bangle: { x: 0, y: 0, angle: 0, size: 0 }
};

/* Auto-Try & Gallery */
let autoTryRunning = false;
let autoSnapshots = [];
let autoTryIndex = 0;
let autoTryTimeout = null;
let currentPreviewData = { url: null, name: 'Jewels-Ai_look.png' }; 

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

/* --- 2. ROBUST VOICE RECOGNITION AI --- */
function initVoiceControl() {
    // Check browser support
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    
    if (!SpeechRecognition) {
        console.warn("Voice Recognition not supported in this browser.");
        if(voiceBtn) voiceBtn.style.display = 'none';
        return;
    }

    recognition = new SpeechRecognition(); 
    recognition.continuous = true; // Keep listening
    recognition.interimResults = false; // Only final results
    recognition.lang = 'en-US';

    // 1. On Start: Update UI
    recognition.onstart = () => {
        isRecognizing = true;
        console.log("Voice Engine: Active");
        if(voiceBtn) {
            voiceBtn.style.backgroundColor = "rgba(0, 255, 0, 0.2)"; // Green tint
            voiceBtn.style.borderColor = "#00ff00";
        }
    };

    // 2. On Result: Process Command
    recognition.onresult = (event) => {
        const lastResult = event.results[event.results.length - 1];
        if (lastResult.isFinal) {
            const command = lastResult[0].transcript.trim().toLowerCase();
            console.log("Heard command:", command); // Debug log
            processVoiceCommand(command);
        }
    };

    // 3. On Error: Log it
    recognition.onerror = (event) => {
        console.warn("Voice Error:", event.error);
        if (event.error === 'not-allowed') {
            alert("Microphone access blocked. Please allow permissions.");
            voiceEnabled = false;
        }
    };

    // 4. On End: Auto-Restart if enabled
    recognition.onend = () => {
        isRecognizing = false;
        if (voiceEnabled) {
            console.log("Voice Engine: Restarting...");
            // Small delay to prevent crashing browser loops
            setTimeout(() => { 
                try { recognition.start(); } catch(e) {} 
            }, 500); 
        } else {
            if(voiceBtn) {
                voiceBtn.style.backgroundColor = "rgba(0,0,0,0.5)";
                voiceBtn.style.borderColor = "white";
            }
        }
    };

    // Try to start immediately (might be blocked by browser until user interacts)
    try { recognition.start(); } catch(e) { console.log("Auto-start blocked, waiting for click."); }
}

function toggleVoiceControl() {
    if (!recognition) {
        initVoiceControl();
        return;
    }

    if (voiceEnabled) {
        // Turn OFF
        voiceEnabled = false; 
        recognition.stop();
        if(voiceBtn) {
            voiceBtn.innerHTML = '🔇'; 
            voiceBtn.classList.add('voice-off');
        }
    } else {
        // Turn ON
        voiceEnabled = true; 
        try { recognition.start(); } catch(e) {}
        if(voiceBtn) {
            voiceBtn.innerHTML = '🎙️'; 
            voiceBtn.classList.remove('voice-off');
        }
    }
}

function processVoiceCommand(cmd) {
    // Clean string just in case
    cmd = cmd.replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g,"");
    
    // NAVIGATION
    if (cmd.includes('next') || cmd.includes('change') || cmd.includes('forward')) {
        navigateJewelry(1);
        triggerVisualFeedback("Next Design");
    }
    else if (cmd.includes('back') || cmd.includes('previous') || cmd.includes('return')) {
        navigateJewelry(-1);
        triggerVisualFeedback("Previous Design");
    }
    
    // CAPTURE
    else if (cmd.includes('photo') || cmd.includes('capture') || cmd.includes('click') || cmd.includes('snap')) {
        takeSnapshot();
    }
    
    // CATEGORIES
    else if (cmd.includes('earring') || cmd.includes('ear')) selectJewelryType('earrings');
    else if (cmd.includes('chain') || cmd.includes('neck') || cmd.includes('necklace')) selectJewelryType('chains');
    else if (cmd.includes('ring') || cmd.includes('finger')) selectJewelryType('rings');
    else if (cmd.includes('bangle') || cmd.includes('wrist') || cmd.includes('bracelet')) selectJewelryType('bangles');
}

// Visual Helper to show user their command worked
function triggerVisualFeedback(text) {
    const feedback = document.createElement('div');
    feedback.innerText = text;
    feedback.style.position = 'fixed'; feedback.style.top = '20%'; feedback.style.left = '50%';
    feedback.style.transform = 'translate(-50%, -50%)'; feedback.style.background = 'rgba(0,0,0,0.7)';
    feedback.style.color = '#fff'; feedback.style.padding = '10px 20px'; feedback.style.borderRadius = '20px';
    feedback.style.zIndex = '1000'; feedback.style.pointerEvents = 'none';
    document.body.appendChild(feedback);
    setTimeout(() => { feedback.remove(); }, 1000);
}

/* --- 3. GOOGLE DRIVE FETCHING --- */
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
    if (!JEWELRY_ASSETS[type]) {
        loadingStatus.style.display = 'none';
        return;
    }
    if (!PRELOADED_IMAGES[type]) {
        PRELOADED_IMAGES[type] = [];
        const promises = JEWELRY_ASSETS[type].map(file => {
            return new Promise((resolve) => {
                const img = new Image(); img.crossOrigin = 'anonymous'; 
                img.onload = () => resolve(img); img.onerror = () => resolve(null); 
                img.src = file.src; PRELOADED_IMAGES[type].push(img);
            });
        });
        if(videoElement.paused) {
             loadingStatus.textContent = "Downloading Assets...";
        }
        await Promise.all(promises); 
    }
    loadingStatus.style.display = 'none';
}

/* --- 4. INSTANT DOWNLOAD --- */
function downloadSingleSnapshot() {
    if(!currentPreviewData.url) { alert("No image to download."); return; }

    const overlay = document.getElementById('process-overlay');
    const statusText = document.getElementById('process-text');
    
    if (overlay && statusText) { overlay.style.display = 'flex'; statusText.innerText = "Downloading..."; }
    
    // Save to device
    saveAs(currentPreviewData.url, currentPreviewData.name);

    setTimeout(() => {
        if (statusText) statusText.innerText = "Download Completed!";
        setTimeout(() => { if (overlay) overlay.style.display = 'none'; }, 1500);
    }, 1500);
}

function downloadAllAsZip() {
    if (autoSnapshots.length === 0) { alert("No images to download!"); return; }

    const overlay = document.getElementById('process-overlay');
    const statusText = document.getElementById('process-text');
    if(overlay) { overlay.style.display = 'flex'; statusText.innerText = "Zipping Files..."; }
    
    const zip = new JSZip(); 
    const folder = zip.folder("Jewels-Ai_Collection");
    
    autoSnapshots.forEach(item => {
        folder.file(item.name, item.url.replace(/^data:image\/(png|jpg);base64,/, ""), {base64:true});
    });

    zip.generateAsync({type:"blob"})
       .then(content => {
           saveAs(content, "Jewels-Ai_Collection.zip");
           if(statusText) statusText.innerText = "Download Completed!";
           setTimeout(() => { if(overlay) overlay.style.display = 'none'; }, 1500);
       });
}

async function shareSingleSnapshot() {
    if(!currentPreviewData.url) return;
    const blob = await (await fetch(currentPreviewData.url)).blob();
    const file = new File([blob], "look.png", { type: "image/png" });
    if (navigator.share) navigator.share({ files: [file] }).catch(console.warn);
    else alert("Share not supported.");
}

/* --- 5. PHYSICS & AI CORE --- */
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
          const yOffset = currentDist * 0.15;
          canvasCtx.drawImage(ringImg, -handSmoother.ring.size/2, yOffset, handSmoother.ring.size, rHeight); 
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

      if (!autoTryRunning) {
          const now = Date.now();
          if (now - lastGestureTime > GESTURE_COOLDOWN) {
              const indexTip = lm[8]; 
              if (previousHandX !== null) {
                  const diff = indexTip.x - previousHandX;
                  if (Math.abs(diff) > 0.04) { navigateJewelry(diff < 0 ? 1 : -1); lastGestureTime = now; previousHandX = null; }
              }
              if (now - lastGestureTime > 100) previousHandX = indexTip.x;
          }
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
      const neckY = neck.y + (earDist*0.1);
      canvasCtx.drawImage(necklaceImg, neck.x - nw/2, neckY, nw, nh);
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

/* --- UI HELPERS & TRACKING --- */
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

  // Track name
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
      
      // Track name
      if (JEWELRY_ASSETS[type] && JEWELRY_ASSETS[type][0]) {
          currentAssetName = JEWELRY_ASSETS[type][0].name;
      }
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
        
        currentAssetName = file.name; // Manual Click Tracker
    };
    container.appendChild(btnImg);
  });
}

function toggleTryAll() {
    if (!currentType) { alert("Select category!"); return; }
    if (autoTryRunning) stopAutoTry(); else startAutoTry();
}
function startAutoTry() {
    autoTryRunning = true; autoSnapshots = []; autoTryIndex = 0;
    document.getElementById('tryall-btn').textContent = "STOP";
    runAutoStep();
}
function stopAutoTry() {
    autoTryRunning = false; clearTimeout(autoTryTimeout);
    document.getElementById('tryall-btn').textContent = "Try All";
    if (autoSnapshots.length > 0) showGallery();
}

async function runAutoStep() {
    if (!autoTryRunning) return;
    const assets = PRELOADED_IMAGES[currentType];
    if (!assets || autoTryIndex >= assets.length) { stopAutoTry(); return; }
    const targetImg = assets[autoTryIndex];
    if (currentType === 'earrings') earringImg = targetImg; else if (currentType === 'chains') necklaceImg = targetImg;
    else if (currentType === 'rings') ringImg = targetImg; else if (currentType === 'bangles') bangleImg = targetImg;
    
    // [UPDATED] Update the Description variable BEFORE capturing
    if (JEWELRY_ASSETS[currentType] && JEWELRY_ASSETS[currentType][autoTryIndex]) {
        currentAssetName = JEWELRY_ASSETS[currentType][autoTryIndex].name;
    }

    // Capture happens after 1.5s, allowing the image and name to settle
    autoTryTimeout = setTimeout(() => { triggerFlash(); captureToGallery(); autoTryIndex++; runAutoStep(); }, 1500); 
}

/* --- CAPTURE & OVERLAY (FILENAME DESCRIPTION) --- */
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
  
  // TEXT LOGIC: Use Filename as Description
  const productTitle = "Product Description";
  let cleanName = currentAssetName.replace(/\.(png|jpg|jpeg|webp)$/i, "").replace(/_/g, " ");
  cleanName = cleanName.charAt(0).toUpperCase() + cleanName.slice(1);
  
  const productDesc = cleanName;

  // LAYOUT
  const padding = tempCanvas.width * 0.04; 
  const titleSize = tempCanvas.width * 0.045; 
  const descSize = tempCanvas.width * 0.035; 
  const lineHeight = descSize * 1.4;
  
  tempCtx.font = `${descSize}px Montserrat, sans-serif`;
  const maxWidth = tempCanvas.width - (padding * 2);
  const words = productDesc.split(' ');
  let lines = [];
  let currentLine = words[0];

  for (let i = 1; i < words.length; i++) {
      const width = tempCtx.measureText(currentLine + " " + words[i]).width;
      if (width < maxWidth) { currentLine += " " + words[i]; } 
      else { lines.push(currentLine); currentLine = words[i]; }
  }
  lines.push(currentLine);

  const contentHeight = (titleSize * 1.5) + (titleSize * 0.5) + (lines.length * lineHeight) + padding;
  
  // BACKGROUND
  const gradient = tempCtx.createLinearGradient(0, tempCanvas.height - contentHeight - padding, 0, tempCanvas.height);
  gradient.addColorStop(0, "rgba(0,0,0,0)");      
  gradient.addColorStop(0.2, "rgba(0,0,0,0.8)");  
  gradient.addColorStop(1, "rgba(0,0,0,0.95)");   
  
  tempCtx.fillStyle = gradient;
  tempCtx.fillRect(0, tempCanvas.height - contentHeight - padding, tempCanvas.width, contentHeight + padding);

  // TITLE & TEXT
  tempCtx.font = `bold ${titleSize}px Playfair Display, serif`;
  tempCtx.fillStyle = "#d4af37"; 
  tempCtx.textAlign = "left"; tempCtx.textBaseline = "top";
  const titleY = tempCanvas.height - contentHeight;
  tempCtx.fillText(productTitle, padding, titleY);

  tempCtx.font = `${descSize}px Montserrat, sans-serif`;
  tempCtx.fillStyle = "#ffffff"; 
  const descStartY = titleY + (titleSize * 1.5); 
  
  lines.forEach((line, index) => {
      tempCtx.fillText(line, padding, descStartY + (index * lineHeight));
  });

  // WATERMARK
  if (watermarkImg.complete) {
      const wWidth = tempCanvas.width * 0.25; 
      const wHeight = (watermarkImg.height / watermarkImg.width) * wWidth;
      tempCtx.drawImage(watermarkImg, tempCanvas.width - wWidth - padding, padding, wWidth, wHeight);
  }
  
  const dataUrl = tempCanvas.toDataURL('image/png');
  const safeName = "Jewels_Look";
  autoSnapshots.push({ url: dataUrl, name: `${safeName}_${Date.now()}.png` });
  return { url: dataUrl, name: `${safeName}_${Date.now()}.png` }; 
}

function takeSnapshot() { 
    triggerFlash(); const shotData = captureToGallery(); currentPreviewData = shotData; 
    document.getElementById('preview-image').src = shotData.url; document.getElementById('preview-modal').style.display = 'flex'; 
}

/* --- LIGHTBOX & GALLERY UI --- */
function changeLightboxImage(direction) {
    if (autoSnapshots.length === 0) return;
    currentLightboxIndex = (currentLightboxIndex + direction + autoSnapshots.length) % autoSnapshots.length;
    document.getElementById('lightbox-image').src = autoSnapshots[currentLightboxIndex].url;
}

function showGallery() {
  const grid = document.getElementById('gallery-grid'); grid.innerHTML = '';
  if (autoSnapshots.length === 0) {
      grid.innerHTML = '<p style="color:#666; width:100%; text-align:center;">No photos yet.</p>';
  } else {
      autoSnapshots.forEach((item, index) => {
        const card = document.createElement('div'); card.className = "gallery-card";
        const img = document.createElement('img'); img.src = item.url; img.className = "gallery-img";
        const overlay = document.createElement('div'); overlay.className = "gallery-overlay";
        let cleanName = item.name.replace("Jewels-Ai_", "").replace(".png", "").replace(/_\d+$/, "");
        if(cleanName.length > 15) cleanName = cleanName.substring(0,12) + "...";
        overlay.innerHTML = `<span class="overlay-text">${cleanName}</span><div class="overlay-icon">👁️</div>`;
        card.onclick = () => { 
            currentLightboxIndex = index;
            document.getElementById('lightbox-image').src = item.url; 
            document.getElementById('lightbox-overlay').style.display = 'flex'; 
        };
        card.appendChild(img); card.appendChild(overlay); grid.appendChild(card);
      });
  }
  document.getElementById('gallery-modal').style.display = 'flex';
}

function closePreview() { document.getElementById('preview-modal').style.display = 'none'; }
function closeGallery() { document.getElementById('gallery-modal').style.display = 'none'; }
function closeLightbox() { document.getElementById('lightbox-overlay').style.display = 'none'; }

/* --- EXPORTS --- */
window.selectJewelryType = selectJewelryType; window.toggleTryAll = toggleTryAll;
window.closeGallery = closeGallery; window.closeLightbox = closeLightbox; window.takeSnapshot = takeSnapshot;
window.downloadAllAsZip = downloadAllAsZip; window.closePreview = closePreview;
window.downloadSingleSnapshot = downloadSingleSnapshot; window.shareSingleSnapshot = shareSingleSnapshot;
window.changeLightboxImage = changeLightboxImage; window.toggleVoiceControl = toggleVoiceControl;

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
        videoElement.onloadeddata = () => { 
            videoElement.play(); loadingStatus.style.display = 'none'; 
            detectLoop(); if(!recognition) initVoiceControl(); 
        };
    } catch (err) { alert("Camera Error: " + err.message); loadingStatus.textContent = "Camera Error"; }
}

async function detectLoop() {
    if (videoElement.readyState >= 2) {
        if (!isProcessingFace) { isProcessingFace = true; await faceMesh.send({image: videoElement}); }
        if (!isProcessingHand) { isProcessingHand = true; await hands.send({image: videoElement}); }
    }
    requestAnimationFrame(detectLoop);
}