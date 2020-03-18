const SpeechRecognition = window.webkitSpeechRecognition || window.SpeechRecognition;
const SpeechGrammarList = window.webkitSpeechGrammarList || window.SpeechGrammarList;

const getRoomModeByHash = () => (location.hash === '#sfu' ? 'sfu' : 'mesh');

// 簡易的なオブザーバー作成器
// const observable = enhance({test: "111"});
// observable.$after_set.test = function(target, prop, value) { console.log(target, prop, value); }
// observable.test = "123";
function enhance(obj) {
  if(Array.isArray(obj)) {
    return enhanceArray(obj)
  } else {
    return enhanceObject(obj);
  }
}

function avoidInsert(obj) {
  return new Proxy({}, {
    set: function (target, prop, value) {
      if(!obj.hasOwnProperty(prop)) {
        throw Error(`new propety cannot set: ${prop}`)
      }

      Reflect.set(target, prop, value);
    }
  });
}

function enhanceObject(obj) {
  const after_set_key = '$after_set';
  const enhanceKeys = [after_set_key];

  enhanceKeys.forEach (enhanceKey => { obj[enhanceKey] = avoidInsert(obj); })

  return new Proxy(obj, {
    set: function (target, prop, value) {
      if(!obj.hasOwnProperty(prop)) {
        throw Error(`new propety cannot set: ${prop}`)
      }

      Reflect.set(target, prop, value);
      const listener = obj[after_set_key][prop];
      if (listener) {
        listener(target, prop, value);
      }
      return true;
    },
    has (target, key) {
      if (enhanceKeys.includes(key)) {
        return false;
      }
      return key in target;
    }
  });
}

function enhanceArray(array) {
  const after_insert_key = '$after_insert';
  const after_update_key = '$after_update';
  const after_delete_key = '$after_delete';
  const enhanceKeys = [after_insert_key, after_update_key, after_delete_key];

  enhanceKeys.forEach (enhanceKey => { array[enhanceKey] = avoidInsert(array); })

  return new Proxy(array, {
    deleteProperty: function(target, prop, value) {
      Reflect.set(target, prop, value);
      if(!isNaN(prop)) {
        const listener = array[after_delete_key];
        if (listener) { listener(target, prop, value); }
      }
      return true;
    },
    set: function(target, prop, value) {
      const isInsert = target[prop] === undefined;
      Reflect.set(target, prop, value);
      if(!isNaN(prop)) {
        const key = isInsert ? after_insert_key : after_update_key;
        const listener = array[key];
        if (listener) { listener(target, prop, value); }
      }
      return true;
    },
    has (target, key) {
      if (enhanceKeys.includes(key)) {
        return false;
      }
      return key in target;
    }
  });
}

function createRecorder() {
  if(!SpeechRecognition) {
    return enhance({
      text: '',
      autoRestart: true,
      enabled: true,
      start: function () {
      },
      stop: function () {
      },
      canAutoRestart: function() {
        return this.autoRestart && this.enabled
      }
    });
  };

  const speech = new SpeechRecognition();

  const instance = enhance({
    text: '',
    autoRestart: true,
    enabled: false,
    start: function () {
      console.log('recorder start');
      speech.start();
    },
    stop: function () {
      console.log('recorder stop');
      speech.stop();
    },
    canAutoRestart: function() {
      return this.autoRestart && this.enabled
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
    console.log('on end');
    if(instance.canAutoRestart()) {
      instance.start();
    }
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

  function appendMessage(text) {
    messages.textContent += `${text}\n`;
  }

  const constraints = {
    audio: true,
    video: {
      width: 280,
      height: 220,
      facingMode: "user"
    }
  };

  const mediaDevices = navigator.mediaDevices ||
    navigator.webkitGetUserMedia ||
    navigator.mozGetUserMedia ||
    navigator.msGetUserMedia;

  if(!mediaDevices) {
    alert('このデバイスではご利用できません');
    return;
  }

  const localStream = await mediaDevices
    .getUserMedia(constraints)
    .catch(console.error);

  // Render local stream
  localVideo.muted = true;
  localVideo.srcObject = localStream;
  localVideo.playsInline = true;
  await localVideo.play().catch(console.error);


  async function createRoom(peer) {
    const status_left = 'left';
    const status_joined = 'joined';

    var room = null;
    const instance = enhance({
      status: status_left,
      localText: '',
      send: function (text) {
        room.send(text);
      },
      close: function () {
        room.close();
      },
      is_joined: function(){
        return this.status === status_joined;
      }
    });

    const callOptions = {
      videoBandwidth: 1
    };

    // Register join handler
    joinTrigger.addEventListener('click', () => {
      // Note that you need to ensure the peer has connected to signaling server
      // before using methods of peer instance.
      if (!peer.open) {
        return;
      }

      if(roomId.value === "") {
        alert('Room Nameを入れてください');
        return;
      }

      const roomOptions = Object.assign({
        mode: getRoomModeByHash(),
        stream: localStream
      }, callOptions);

      room = peer.joinRoom(roomId.value, roomOptions);

      room.once('open', () => {
        instance.status = status_joined
      });
      room.on('peerJoin', peerId => {
        appendMessage(`=== ${peerId} が入室しました ===`);
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
        appendMessage(`${src}: ${data}`);
      });

      // for closing room members
      room.on('peerLeave', peerId => {
        const remoteVideo = remoteVideos.querySelector(
          `[data-peer-id=${peerId}]`
        );
        remoteVideo.srcObject.getTracks().forEach(track => track.stop());
        remoteVideo.srcObject = null;
        remoteVideo.remove();

        appendMessage(`=== ${peerId} が退室しました ===`);
      });

      // for closing myself
      room.once('close', () => {
        sendTrigger.removeEventListener('click', onClickSend);
        instance.status = status_left;
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
  const room = await createRoom(peer);

  room.$after_set.localText = function(target, prop, value) {
    if(value !== '') {
      appendMessage(`${peer.id}: ${value}`);
    }
  }

  room.$after_set.status = function(target, prop, value) {
    if(target.is_joined()) {
      appendMessage('=== 入室しました ===');
      recorder.autoRestart = true
      recorder.start();

      document.body.classList.add("joined");
    } else {
      appendMessage('== 退室しました ===');
      recorder.autoRestart = false
      recorder.stop();

      document.body.classList.remove("joined");
    }
  }

  recorder.$after_set.text = function (target, prop, value) {
    console.log('text event!')

    appendMessage(value);
    room.send(`${value}\n`);

    if (value == "さよなら" || value == "バイバイ") {
      // 側によるを作ったら、「xxxちょっといい？」でxxxさんに寄る
      const closeMessage = '[コマンド一致！]退室します\n';
      appendMessage(closeMessage);
      room.send(closeMessage);
      room.close();
    }
  }
})();
