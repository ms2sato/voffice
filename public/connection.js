const Peer = window.Peer;

(async function main() {
  const callPanelTemplate = document.getElementById('callPanelTemplate').innerText;

  const localVideo = document.getElementById('js-local-stream');
  // Render local stream
  // localVideo.muted = true;
  // localVideo.srcObject = localStream;
  // localVideo.playsInline = true;
  // await localVideo.play().catch(console.error);
  const meta = document.getElementById('js-meta');
  const sdkSrc = document.querySelector('script[src*=skyway]');
  meta.innerText = `
    UA: ${navigator.userAgent}
    SDK: ${sdkSrc ? sdkSrc.src : 'unknown'}
  `.trim();

  const localId = document.getElementById('js-local-id');

  const constraints = {
    audio: true,
    video: {
      width: 280,
      height: 220,
      facingMode: "user"
    }
  };

  const localStream = await navigator.mediaDevices
    .getUserMedia(constraints)
    .catch(console.error);

  const peer = (window.peer = new Peer({
    key: window.__SKYWAY_KEY__,
    debug: 3,
  }));

  peer.on('error', console.error);
  peer.once('open', id => (localId.textContent = id));

  // Register callee handler
  peer.on('call', mediaConnection => {
    mediaConnection.answer(localStream, callOptions);
    if (mediaConnections[mediaConnection.id]) {
      // already connected
      return;
    }

    mediaConnections[mediaConnection.id] = mediaConnection;

    newPanel().addEvents(mediaConnection);
  });

  const callOptions = {
    videoBandwidth: 1
  };

  const mediaConnections = {}

  const callTrigger = document.getElementById('js-call-trigger');
  callTrigger.addEventListener('click', () => {
    // Note that you need to ensure the peer has connected to signaling server
    // before using methods of peer instance.
    if (!peer.open) {
      return;
    }

    const remoteId = document.getElementById('js-remote-id');
    const mediaConnection = peer.call(remoteId.value, localStream, callOptions);
    mediaConnections[mediaConnection.id] = mediaConnection;
    newPanel().addEvents(mediaConnection);

    remoteId.value = "";
  });


  function newPanel() {
    const callPanels = document.getElementsByClassName('call-panels')[0];
    callPanels.insertAdjacentHTML('beforeend', callPanelTemplate);
    const callPanel =  callPanels.querySelector('.call-panel:last-child');

    const closeTrigger = callPanel.getElementsByClassName('js-close-trigger')[0];
    const remoteVideo = callPanel.getElementsByClassName('js-remote-stream')[0];

    function addEvents(mediaConnection) {
      callPanel.getElementsByClassName('mid')[0].innerText = mediaConnection.remoteId;

      mediaConnection.on('stream', async stream => {
        // Render remote stream for caller
        remoteVideo.srcObject = stream;
        remoteVideo.playsInline = true;
        await remoteVideo.play().catch(console.error);
      });

      mediaConnection.once('close', () => {
        remoteVideo.srcObject.getTracks().forEach(track => track.stop());
        remoteVideo.srcObject = null;

        dispose();
      });

      closeTrigger.addEventListener('click', () => {
        mediaConnection.close(true)
      });

      function dispose() {
        delete mediaConnections[mediaConnection.id]
        callPanel.parentNode.removeChild(callPanel);
      }
    }

    return {
      addEvents: addEvents
    }
  }

})();