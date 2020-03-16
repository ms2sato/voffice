const Peer = window.Peer;

(async function main() {
  const callPanelTemplate = document.getElementById('callPanelTemplate').innerText;
  // function appendTo() {
  //   const callPanels = document.getElementsByClassName('call-panels')[0];
  //   callPanels.insertAdjacentHTML('beforeend', callPanelTemplate);
  //   return callPanels.querySelector('.call-panel:last-child');
  // }

  const constraints = {
    audio: true,
    video: {
      width: 280,
      height: 220,
      facingMode: "user"
    }
  };

  const callOptions = {
    videoBandwidth: 1
  };

  const localVideo = document.getElementById('js-local-stream');
  const joinTrigger = document.getElementById('js-join-trigger');
  const leaveTrigger = document.getElementById('js-leave-trigger');
  const remoteVideos = document.getElementById('js-remote-streams');
  const roomId = document.getElementById('js-room-id');
  const roomMode = document.getElementById('js-room-mode');
  const localText = document.getElementById('js-local-text');
  const sendTrigger = document.getElementById('js-send-trigger');
  const messages = document.getElementById('js-messages');
  const meta = document.getElementById('js-meta');
  const sdkSrc = document.querySelector('script[src*=skyway]');

  meta.innerText = `
    UA: ${navigator.userAgent}
    SDK: ${sdkSrc ? sdkSrc.src : 'unknown'}
  `.trim();

  const getRoomModeByHash = () => (location.hash === '#sfu' ? 'sfu' : 'mesh');

  roomMode.textContent = getRoomModeByHash();
  window.addEventListener(
    'hashchange',
    () => (roomMode.textContent = getRoomModeByHash())
  );

  const localStream = await navigator.mediaDevices
    .getUserMedia(constraints)
    .catch(console.error);

  // Render local stream
  localVideo.muted = true;
  localVideo.srcObject = localStream;
  localVideo.playsInline = true;
  await localVideo.play().catch(console.error);

  // eslint-disable-next-line require-atomic-updates
  const peer = (window.peer = new Peer({
    key: window.__SKYWAY_KEY__,
    debug: 3,
  }));

  // Register join handler
  joinTrigger.addEventListener('click', () => {
    // Note that you need to ensure the peer has connected to signaling server
    // before using methods of peer instance.
    if (!peer.open) {
      return;
    }

    const roomOptions = Object.assign({
      mode: getRoomModeByHash(),
      stream: localStream
    },callOptions);

    const room = peer.joinRoom(roomId.value, roomOptions);

    room.once('open', () => {
      messages.textContent += '=== 入室しました ===\n';
    });
    room.on('peerJoin', peerId => {
      messages.textContent += `=== ${peerId} が退室しました ===\n`;
    });

    // Render remote stream for new peer join in the room
    room.on('stream', async stream => {
      const newVideo = document.createElement('video');
      newVideo.srcObject = stream;
      newVideo.playsInline = true;
      // mark peerId to find it later at peerLeave event
      newVideo.setAttribute('data-peer-id', stream.peerId);
      remoteVideos.append(newVideo);
      await newVideo.play().catch(console.error);
    });

    room.on('data', ({ data, src }) => {
      // Show a message sent to the room and who sent
      messages.textContent += `${src}: ${data}\n`;
    });

    // for closing room members
    room.on('peerLeave', peerId => {
      const remoteVideo = remoteVideos.querySelector(
        `[data-peer-id=${peerId}]`
      );
      remoteVideo.srcObject.getTracks().forEach(track => track.stop());
      remoteVideo.srcObject = null;
      remoteVideo.remove();

      messages.textContent += `=== ${peerId} が退室しました ===\n`;
    });

    // for closing myself
    room.once('close', () => {
      sendTrigger.removeEventListener('click', onClickSend);
      messages.textContent += '== 退室しました ===\n';
      Array.from(remoteVideos.children).forEach(remoteVideo => {
        remoteVideo.srcObject.getTracks().forEach(track => track.stop());
        remoteVideo.srcObject = null;
        remoteVideo.remove();
      });
    });

    sendTrigger.addEventListener('click', onClickSend);
    leaveTrigger.addEventListener('click', () => room.close(), { once: true });

    function onClickSend() {
      // Send message to all of the peers in the room via websocket
      room.send(localText.value);

      messages.textContent += `${peer.id}: ${localText.value}\n`;
      localText.value = '';
    }

    const speech = new webkitSpeechRecognition();
    speech.lang = 'ja-JP';
    speech.continuous = false
    speech.interimResults = false

    speech.addEventListener('result', function(e) {
      console.log('on result')
      speech.stop();
      if(e.results[0].isFinal){
          var autotext =  e.results[0][0].transcript
          messages.textContent += autotext + '\n';
       }
    });

    speech.addEventListener('end', () => {
      console.log('on end')
      speech.start()
    });
    speech.start();

    speech.onstart = () => { console.log('on start') }
    // speech.onend = () => { console.log('on end') }

    speech.onspeechstart = () => { console.log('on speech start') }
    speech.onspeechend = () => { console.log('on speech end') }

    speech.onosundstart = () => { console.log('on sound start') }
    speech.onsoundend = () => { console.log('on sound end') }

    speech.onaudiostart = () => { console.log('on audio start') }
    speech.onaudioend = () => { console.log('on audio end') }
  });

  peer.on('error', console.error);
})();
