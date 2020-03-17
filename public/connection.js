const SpeechRecognition = window.webkitSpeechRecognition || window.SpeechRecognition;
const SpeechGrammarList = window.webkitSpeechGrammarList || window.SpeechGrammarList;

const getRoomModeByHash = () => (location.hash === '#sfu' ? 'sfu' : 'mesh');

// 簡易的なオブザーバー作成器
// const observable = enhance({});
// observable.__after_set__.test = function(target, prop, value) { console.log(target, prop, value); }
// observable.test = "123";
function enhance(obj) {
  obj['__after_set__'] = {}
  return new Proxy(obj, {
    set: function (target, prop, value) {
      Reflect.set(target, prop, value);
      const listener = obj.__after_set__[prop];
      if (listener) {
        listener(target, prop, value);
      }
    }
  });
}

function createRecorder() {
  const speech = new SpeechRecognition();

  const instance = enhance({
    start: function () {
      // console.log('recorder start');
      speech.start();
    },
    stop: function () {
      // console.log('recorder stop');
      speech.stop();
    }
  });

  speech.lang = 'ja-JP';
  var rule = 'ちょっといい | ねえ | もしもし | はなせる | キター | やったー';

  var grammar = `#JSGF V1.0 JIS ja; grammar options; public <options> = ${rule} ;`
  // const speechRecognitionList = new SpeechGrammarList()
  const speechRecognitionList = speech.grammars;
  speechRecognitionList.addFromString(grammar, 1)
  speech.grammars = speechRecognitionList

  speech.addEventListener('result', function (e) {
    console.log('on result')
    instance.stop();
    if (e.results[0].isFinal) {
      console.log('is final')
      instance.text = e.results[0][0].transcript;
    }
  });

  speech.addEventListener('end', () => {
    console.log('on end')
    instance.start()
  });

  return instance;
}

(async function main() {
  const callPanelTemplate = document.getElementById('callPanelTemplate').innerText;
  // function appendTo() {
  //   const callPanels = document.getElementsByClassName('call-panels')[0];
  //   callPanels.insertAdjacentHTML('beforeend', callPanelTemplate);
  //   return callPanels.querySelector('.call-panel:last-child');
  // }

  const meta = document.getElementById('js-meta');
  const sdkSrc = document.querySelector('script[src*=skyway]');
  const messages = document.getElementById('js-messages');
  const roomMode = document.getElementById('js-room-mode');
  const joinTrigger = document.getElementById('js-join-trigger');
  const leaveTrigger = document.getElementById('js-leave-trigger');
  const remoteVideos = document.getElementById('js-remote-streams');
  const roomId = document.getElementById('js-room-id');
  const localText = document.getElementById('js-local-text');
  const sendTrigger = document.getElementById('js-send-trigger');
  const localVideo = document.getElementById('js-local-stream');

  async function createRoom(peer) {
    var room = null;
    const instance = enhance({
      status: 'left',
      send: function (text) {
        room.send(text);
      },
      close: function () {
        room.close();
      }
    });

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

    const localStream = await navigator.mediaDevices
      .getUserMedia(constraints)
      .catch(console.error);

    // Render local stream
    localVideo.muted = true;
    localVideo.srcObject = localStream;
    localVideo.playsInline = true;
    await localVideo.play().catch(console.error);

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
      }, callOptions);

      room = peer.joinRoom(roomId.value, roomOptions);

      room.once('open', () => {
        instance.status = 'joined'
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

      room.on('data', ({
        data,
        src
      }) => {
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
        instance.status = 'left';
        Array.from(remoteVideos.children).forEach(remoteVideo => {
          remoteVideo.srcObject.getTracks().forEach(track => track.stop());
          remoteVideo.srcObject = null;
          remoteVideo.remove();
        });
      });

      sendTrigger.addEventListener('click', onClickSend);
      leaveTrigger.addEventListener('click', () => room.close(), {
        once: true
      });

      function onClickSend() {
        // Send message to all of the peers in the room via websocket
        room.send(localText.value);
        instance.localText = localText.value;
        localText.value = '';
      }
    });

    return instance;
  }

  meta.innerText = `
    UA: ${navigator.userAgent}
    SDK: ${sdkSrc ? sdkSrc.src : 'unknown'}
  `.trim();

  roomMode.textContent = getRoomModeByHash();
  window.addEventListener(
    'hashchange',
    () => (roomMode.textContent = getRoomModeByHash())
  );

  const Peer = window.Peer;

  // eslint-disable-next-line require-atomic-updates
  const peer = (window.peer = new Peer({
    key: window.__SKYWAY_KEY__,
    debug: 3,
  }));

  peer.on('error', console.error);

  const recorder = createRecorder();
  const room = await createRoom(peer, recorder);

  room.__after_set__.localText = function(target, prop, value) {
    if(value !== '') {
      messages.textContent += `${peer.id}: ${value}\n`;
    }
  }

  room.__after_set__.status = function(target, prop, value) {
    if(value == 'joined') {
      messages.textContent += '=== 入室しました ===\n';
      recorder.start();
    } else {
      messages.textContent += '== 退室しました ===\n';
      recorder.stop();
    }
  }

  recorder.__after_set__.text = function (target, prop, value) {
    console.log('text event!')

    const line = value + '\n'
    messages.textContent += line;
    room.send(line);

    if (value == "さよなら" || value == "バイバイ") {
      // 側によるを作ったら、「xxxちょっといい？」でxxxさんに寄る
      const closeMessage = '[コマンド一致！]退室します\n';
      messages.textContent += closeMessage;
      room.send(closeMessage);
      room.close();
    }
  }

})();
