const Peer = window.Peer;

(async function main() {

  const callRoots = document.getElementsByClassName('call');

  const constraints = {
    audio: true,
    video: {
      width: 300,
      height: 200,
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

  const localVideo = document.getElementById('js-local-stream');
  // Render local stream
  // localVideo.muted = true;
  // localVideo.srcObject = localStream;
  // localVideo.playsInline = true;
  // await localVideo.play().catch(console.error);

  const callOptions = {
    // audioBandwidth: 1,
    videoBandwidth: 1
  };

  Array.from(callRoots).forEach(callRoot => {
    const localId = callRoot.getElementsByClassName('js-local-id')[0];
    const callTrigger = callRoot.getElementsByClassName('js-call-trigger')[0];
    const closeTrigger = callRoot.getElementsByClassName('js-close-trigger')[0];
    const remoteVideo = callRoot.getElementsByClassName('js-remote-stream')[0];
    const remoteId = callRoot.getElementsByClassName('js-remote-id')[0];
    const meta = callRoot.getElementsByClassName('js-meta')[0];
    const sdkSrc = callRoot.querySelector('script[src*=skyway]');

    meta.innerText = `
      UA: ${navigator.userAgent}
      SDK: ${sdkSrc ? sdkSrc.src : 'unknown'}
    `.trim();

    // Register caller handler
    callTrigger.addEventListener('click', () => {
      // Note that you need to ensure the peer has connected to signaling server
      // before using methods of peer instance.
      if (!peer.open) {
        return;
      }

      const mediaConnection = peer.call(remoteId.value, localStream, callOptions);

      mediaConnection.on('stream', async stream => {
        // Render remote stream for caller
        remoteVideo.srcObject = stream;
        remoteVideo.playsInline = true;
        await remoteVideo.play().catch(console.error);
      });

      mediaConnection.once('close', () => {
        remoteVideo.srcObject.getTracks().forEach(track => track.stop());
        remoteVideo.srcObject = null;
      });

      closeTrigger.addEventListener('click', () => mediaConnection.close(true));
    });

    peer.once('open', id => (localId.textContent = id));

    // Register callee handler
    peer.on('call', mediaConnection => {
      mediaConnection.answer(localStream, callOptions);

      mediaConnection.on('stream', async stream => {
        // Render remote stream for callee
        remoteVideo.srcObject = stream;
        remoteVideo.playsInline = true;
        await remoteVideo.play().catch(console.error);
      });

      mediaConnection.once('close', () => {
        remoteVideo.srcObject.getTracks().forEach(track => track.stop());
        remoteVideo.srcObject = null;
      });

      closeTrigger.addEventListener('click', () => mediaConnection.close(true));
    });
  });




})();