/**
 * HomeCast – Client-side Application
 * Handles Camera mode (broadcaster) and Viewer mode (consumer) via PeerJS / WebRTC.
 *
 * Flow:
 *   1. Camera registers as peer "homecast-cam-XXXX" on the LOCAL PeerJS server.
 *   2. Viewer opens a data connection to the camera peer.
 *   3. Camera receives the data connection, then CALLS the viewer with the
 *      real video stream (camera → viewer). This avoids the viewer needing to
 *      supply a dummy stream.
 */

(() => {
  'use strict';

  /* ------------------------------------------------------------------ */
  /*  PeerJS server config — loaded dynamically from /api/config         */
  /* ------------------------------------------------------------------ */
  let PEER_SERVER = null;  // set after fetching config

  async function loadConfig() {
    try {
      const res = await fetch('/api/config');
      const cfg = await res.json();
      PEER_SERVER = {
        host: location.hostname,
        port: Number(location.port) || (location.protocol === 'https:' ? 443 : 80),
        path: '/peerjs',
        secure: location.protocol === 'https:',
        debug: 1,
        config: { iceServers: cfg.iceServers },
      };
      console.log(`[HomeCast] Mode: ${cfg.mode}, ICE servers: ${cfg.iceServers.length}`);
    } catch (err) {
      console.error('[HomeCast] Failed to load config, using defaults:', err);
      PEER_SERVER = {
        host: location.hostname,
        port: Number(location.port) || 443,
        path: '/peerjs',
        secure: location.protocol === 'https:',
        debug: 1,
        config: {
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
          ],
        },
      };
    }
  }

  /* ------------------------------------------------------------------ */
  /*  DOM References                                                     */
  /* ------------------------------------------------------------------ */
  const $ = (sel) => document.querySelector(sel);

  const screens = {
    home:   $('#screen-home'),
    camera: $('#screen-camera'),
    viewer: $('#screen-viewer'),
  };

  // Home
  const btnCamera = $('#btn-camera');
  const btnViewer = $('#btn-viewer');

  // Camera
  const btnCamBack        = $('#btn-cam-back');
  const camLiveBadge      = $('#cam-live-badge');
  const camPreviewWrap    = $('#cam-preview-wrapper');
  const camPreview        = $('#cam-preview');
  const camSetupMsg       = $('#cam-setup-msg');
  const camPinDisplay     = $('#cam-pin');
  const btnCamFullscreen  = $('#btn-cam-fullscreen');
  const camUptimeEl       = $('#cam-uptime');
  const camViewerCount    = $('#cam-viewer-count');
  const camViewerNum      = $('#cam-viewer-num');

  // Viewer
  const btnViewBack         = $('#btn-view-back');
  const viewerPinInput      = $('#viewer-pin-input');
  const btnConnect          = $('#btn-connect');
  const viewerStatus        = $('#viewer-status');
  const viewerConnPanel     = $('#viewer-connect-panel');
  const viewerFeedPanel     = $('#viewer-feed-panel');
  const viewerVideo         = $('#viewer-video');
  const viewerVideoFrame    = $('#viewer-video-frame');
  const btnDisconnect       = $('#btn-disconnect');
  const btnViewerFullscreen = $('#btn-viewer-fullscreen');
  const viewerElapsedEl     = $('#viewer-elapsed');
  const viewerResolutionEl  = $('#viewer-resolution');
  const viewerFpsEl         = $('#viewer-fps');

  /* ------------------------------------------------------------------ */
  /*  State                                                              */
  /* ------------------------------------------------------------------ */
  let peer        = null;
  let localStream = null;
  let wakeLock    = null;
  let activeCall  = null;

  // Timers
  let camStartTime     = null;
  let camTimerInterval  = null;
  let viewStartTime    = null;
  let viewTimerInterval = null;
  let viewStatsInterval = null;
  let viewerConnections = 0;       // camera-side: how many viewers

  /* ------------------------------------------------------------------ */
  /*  Navigation                                                         */
  /* ------------------------------------------------------------------ */
  function showScreen(name) {
    Object.entries(screens).forEach(([key, el]) => {
      if (key === name) {
        el.classList.remove('hidden');
        el.classList.add('flex');
      } else {
        el.classList.add('hidden');
        el.classList.remove('flex');
      }
    });
  }

  /* ------------------------------------------------------------------ */
  /*  Utilities                                                          */
  /* ------------------------------------------------------------------ */
  function generatePin() {
    return String(Math.floor(1000 + Math.random() * 9000));
  }

  function formatTime(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    const mm = String(m).padStart(2, '0');
    const ss = String(s).padStart(2, '0');
    return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
  }

  async function requestWakeLock() {
    try {
      if ('wakeLock' in navigator) {
        wakeLock = await navigator.wakeLock.request('screen');
        wakeLock.addEventListener('release', () => console.log('[HomeCast] Wake lock released'));
        console.log('[HomeCast] Wake lock acquired');
      }
    } catch (err) {
      console.warn('[HomeCast] Wake lock failed:', err.message);
    }
  }

  async function releaseWakeLock() {
    if (wakeLock) { await wakeLock.release(); wakeLock = null; }
  }

  function stopStream(stream) {
    if (stream) stream.getTracks().forEach((t) => t.stop());
  }

  function destroyPeer() {
    if (peer) { peer.destroy(); peer = null; }
  }

  /** Toggle fullscreen on an element */
  function toggleFullscreen(el) {
    if (!document.fullscreenElement) {
      (el.requestFullscreen || el.webkitRequestFullscreen || el.msRequestFullscreen).call(el);
    } else {
      (document.exitFullscreen || document.webkitExitFullscreen || document.msExitFullscreen).call(document);
    }
  }

  /* ------------------------------------------------------------------ */
  /*  CAMERA MODE                                                        */
  /* ------------------------------------------------------------------ */
  async function startCameraMode() {
    showScreen('camera');
    camSetupMsg.textContent = 'Requesting camera access…';
    camSetupMsg.classList.remove('hidden');
    camPinDisplay.textContent = '----';
    camLiveBadge.classList.add('hidden');
    camPreviewWrap.classList.add('hidden');
    viewerConnections = 0;
    updateViewerCount();
    camViewerCount.classList.add('hidden');

    // 1. Get camera stream
    try {
      localStream = await navigator.mediaDevices.getUserMedia({
        video: {
          width:      { ideal: 1280 },
          height:     { ideal: 720 },
          frameRate:  { max: 20 },
          facingMode: { ideal: 'environment' },
        },
        audio: false,
      });
    } catch (err) {
      camSetupMsg.textContent = `Camera error: ${err.message}`;
      console.error('[HomeCast] getUserMedia failed:', err);
      return;
    }

    // 2. Show preview
    camPreview.srcObject = localStream;
    camPreviewWrap.classList.remove('hidden');
    camSetupMsg.classList.add('hidden');

    // 3. Wake Lock
    await requestWakeLock();

    // 4. Start uptime timer
    camStartTime = Date.now();
    camUptimeEl.textContent = '00:00';
    camTimerInterval = setInterval(() => {
      camUptimeEl.textContent = formatTime(Math.floor((Date.now() - camStartTime) / 1000));
    }, 1000);

    // 5. Register on the LOCAL PeerJS server
    const pin = generatePin();
    const peerId = `homecast-cam-${pin}`;
    camPinDisplay.textContent = pin;
    camSetupMsg.textContent = 'Connecting to signaling server…';
    camSetupMsg.classList.remove('hidden');

    peer = new Peer(peerId, PEER_SERVER);

    peer.on('open', (id) => {
      console.log(`[HomeCast] Camera peer open: ${id}`);
      camSetupMsg.classList.add('hidden');
      camLiveBadge.classList.remove('hidden');
      camLiveBadge.classList.add('flex');
      camViewerCount.classList.remove('hidden');
      camViewerCount.classList.add('flex');
    });

    // When a viewer connects via data channel → camera calls them back
    peer.on('connection', (dataConn) => {
      console.log(`[HomeCast] Viewer data-channel from: ${dataConn.peer}`);
      dataConn.on('open', () => {
        console.log('[HomeCast] Data channel open – calling viewer with stream');
        viewerConnections++;
        updateViewerCount();

        const call = peer.call(dataConn.peer, localStream);
        call.on('close', () => {
          console.log('[HomeCast] Call to viewer closed');
          viewerConnections = Math.max(0, viewerConnections - 1);
          updateViewerCount();
        });
        call.on('error', (e) => console.error('[HomeCast] Call error:', e));
      });
      dataConn.on('close', () => {
        viewerConnections = Math.max(0, viewerConnections - 1);
        updateViewerCount();
      });
    });

    peer.on('error', (err) => {
      console.error('[HomeCast] Camera peer error:', err);
      if (err.type === 'unavailable-id') {
        camPinDisplay.textContent = '----';
        camSetupMsg.textContent = 'PIN conflict – restarting…';
        camSetupMsg.classList.remove('hidden');
        destroyPeer();
        setTimeout(startCameraMode, 500);
      }
    });
  }

  function updateViewerCount() {
    camViewerNum.textContent = viewerConnections;
  }

  function stopCameraMode() {
    stopStream(localStream);
    localStream = null;
    releaseWakeLock();
    destroyPeer();
    camPreview.srcObject = null;
    camPreviewWrap.classList.add('hidden');
    camSetupMsg.classList.remove('hidden');
    camSetupMsg.textContent = 'Initializing camera…';
    camLiveBadge.classList.add('hidden');
    camPinDisplay.textContent = '----';
    if (camTimerInterval) { clearInterval(camTimerInterval); camTimerInterval = null; }
    camUptimeEl.textContent = '00:00';
    viewerConnections = 0;
    updateViewerCount();
    showScreen('home');
  }

  /* ------------------------------------------------------------------ */
  /*  VIEWER MODE                                                        */
  /* ------------------------------------------------------------------ */
  function openViewerMode() {
    showScreen('viewer');
    resetViewerUI();
  }

  function resetViewerUI() {
    viewerPinInput.value = '';
    btnConnect.disabled = true;
    viewerStatus.textContent = '';
    viewerConnPanel.classList.remove('hidden');
    viewerConnPanel.classList.add('flex');
    viewerFeedPanel.classList.add('hidden');
    viewerFeedPanel.classList.remove('flex');
    viewerVideo.srcObject = null;
    stopViewerTimers();
    if (activeCall) { activeCall.close(); activeCall = null; }
    destroyPeer();
  }

  function connectToCamera() {
    const pin = viewerPinInput.value.trim();
    if (pin.length !== 4) return;

    const remotePeerId = `homecast-cam-${pin}`;
    viewerStatus.textContent = 'Connecting…';
    btnConnect.disabled = true;

    peer = new Peer(undefined, PEER_SERVER);

    peer.on('open', (myId) => {
      console.log(`[HomeCast] Viewer peer open: ${myId}`);
      const dataConn = peer.connect(remotePeerId, { reliable: true });

      dataConn.on('open', () => {
        console.log('[HomeCast] Data channel to camera open – waiting for call-back…');
        viewerStatus.textContent = 'Waiting for camera stream…';
      });

      dataConn.on('error', (err) => {
        console.error('[HomeCast] Data connection error:', err);
        viewerStatus.textContent = 'Could not reach camera. Check PIN & network.';
        btnConnect.disabled = false;
      });
    });

    // Camera will call us back with the video stream
    peer.on('call', (call) => {
      console.log('[HomeCast] Incoming call from camera – answering');
      call.answer();
      activeCall = call;

      call.on('stream', (remoteStream) => {
        console.log('[HomeCast] Receiving remote video stream');
        viewerVideo.srcObject = remoteStream;
        viewerVideo.play().catch(() => {});

        // Switch panels
        viewerConnPanel.classList.add('hidden');
        viewerConnPanel.classList.remove('flex');
        viewerFeedPanel.classList.remove('hidden');
        viewerFeedPanel.classList.add('flex');

        // Start elapsed timer
        startViewerTimers(remoteStream);
      });

      call.on('close', () => {
        console.log('[HomeCast] Call closed by camera');
        viewerStatus.textContent = 'Camera disconnected.';
        stopViewerTimers();
        showConnectPanel();
      });

      call.on('error', (err) => {
        console.error('[HomeCast] Call error:', err);
        viewerStatus.textContent = `Error: ${err.message || err.type}`;
        stopViewerTimers();
        showConnectPanel();
      });
    });

    // Timeout
    setTimeout(() => {
      if (viewerFeedPanel.classList.contains('hidden') && peer) {
        viewerStatus.textContent = 'Could not reach camera. Check PIN & network.';
        btnConnect.disabled = false;
        if (activeCall) { activeCall.close(); activeCall = null; }
        destroyPeer();
      }
    }, 12000);

    peer.on('error', (err) => {
      console.error('[HomeCast] Viewer peer error:', err);
      const msg = err.type === 'peer-unavailable'
        ? 'Camera not found. Check the PIN and make sure the camera is running.'
        : `Connection failed: ${err.type}`;
      viewerStatus.textContent = msg;
      btnConnect.disabled = false;
    });
  }

  /* ---- Viewer timers & stats ---- */

  function startViewerTimers(stream) {
    viewStartTime = Date.now();
    viewerElapsedEl.textContent = '00:00';

    viewTimerInterval = setInterval(() => {
      viewerElapsedEl.textContent = formatTime(Math.floor((Date.now() - viewStartTime) / 1000));
    }, 1000);

    // Resolution & FPS polling
    let lastFrames = 0;
    let lastTime = Date.now();
    viewStatsInterval = setInterval(() => {
      const videoTrack = stream.getVideoTracks()[0];
      if (!videoTrack) return;
      const settings = videoTrack.getSettings();
      if (settings.width && settings.height) {
        viewerResolutionEl.textContent = `${settings.width}×${settings.height}`;
      }
      if (settings.frameRate) {
        viewerFpsEl.textContent = `${Math.round(settings.frameRate)} fps`;
      } else if (viewerVideo.getVideoPlaybackQuality) {
        const q = viewerVideo.getVideoPlaybackQuality();
        const now = Date.now();
        const fps = Math.round(((q.totalVideoFrames - lastFrames) / ((now - lastTime) / 1000)) || 0);
        lastFrames = q.totalVideoFrames;
        lastTime = now;
        viewerFpsEl.textContent = fps > 0 ? `${fps} fps` : '--';
      }
    }, 2000);
  }

  function stopViewerTimers() {
    if (viewTimerInterval)  { clearInterval(viewTimerInterval);  viewTimerInterval = null; }
    if (viewStatsInterval)  { clearInterval(viewStatsInterval);  viewStatsInterval = null; }
    viewerElapsedEl.textContent = '00:00';
    viewerResolutionEl.textContent = '--';
    viewerFpsEl.textContent = '--';
  }

  function showConnectPanel() {
    viewerConnPanel.classList.remove('hidden');
    viewerConnPanel.classList.add('flex');
    viewerFeedPanel.classList.add('hidden');
    viewerFeedPanel.classList.remove('flex');
    btnConnect.disabled = false;
  }

  function disconnectViewer() {
    if (activeCall) { activeCall.close(); activeCall = null; }
    destroyPeer();
    viewerVideo.srcObject = null;
    viewerStatus.textContent = 'Disconnected.';
    stopViewerTimers();
    showConnectPanel();
  }

  function closeViewerMode() {
    disconnectViewer();
    showScreen('home');
  }

  /* ------------------------------------------------------------------ */
  /*  Event Listeners                                                    */
  /* ------------------------------------------------------------------ */
  btnCamera.addEventListener('click', startCameraMode);
  btnCamBack.addEventListener('click', stopCameraMode);

  btnViewer.addEventListener('click', openViewerMode);
  btnViewBack.addEventListener('click', closeViewerMode);

  viewerPinInput.addEventListener('input', () => {
    viewerPinInput.value = viewerPinInput.value.replace(/\D/g, '');
    btnConnect.disabled = viewerPinInput.value.length !== 4;
  });

  // Submit on Enter key in PIN input
  viewerPinInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && viewerPinInput.value.length === 4) {
      btnConnect.click();
    }
  });

  btnConnect.addEventListener('click', connectToCamera);
  btnDisconnect.addEventListener('click', disconnectViewer);

  // Fullscreen buttons
  btnCamFullscreen.addEventListener('click', () => toggleFullscreen(camPreviewWrap));
  btnViewerFullscreen.addEventListener('click', () => toggleFullscreen(viewerVideoFrame));

  // Keyboard shortcut: F key for fullscreen
  document.addEventListener('keydown', (e) => {
    // Ignore if typing in an input field
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    if (e.key === 'f' || e.key === 'F') {
      // Camera screen visible
      if (!screens.camera.classList.contains('hidden') && !camPreviewWrap.classList.contains('hidden')) {
        toggleFullscreen(camPreviewWrap);
      }
      // Viewer screen visible with active feed
      else if (!screens.viewer.classList.contains('hidden') && !viewerFeedPanel.classList.contains('hidden')) {
        toggleFullscreen(viewerVideoFrame);
      }
    }
  });

  // Re-acquire wake lock if page regains visibility (camera mode)
  document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState === 'visible' && localStream && !wakeLock) {
      await requestWakeLock();
    }
  });

  // Load config then enable UI
  loadConfig().then(() => {
    console.log('[HomeCast] App loaded ✓');
  });
})();
