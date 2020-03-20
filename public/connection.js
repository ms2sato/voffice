const getRoomModeByHash = () => (location.hash === '#sfu' ? 'sfu' : 'mesh');

// 簡易的なオブザーバー作成器
// const observable = enhance({test: "111"});
// observable.$afterSet.test = function(target, prop, value) { console.log(target, prop, value); }
// observable.test = "123";
function enhance(obj) {
  if (Array.isArray(obj)) {
    return enhance.asArray(obj);
  } else if (obj instanceof Map) {
    return enhance.asMap(obj);
  } else {
    return enhance.asObject(obj);
  }
}

enhance.avoidInsert = function avoidInsert(obj) {
  return new Proxy({}, {
    set: function (target, prop, value) {
      if (!obj.hasOwnProperty(prop)) {
        throw Error(`new propety cannot set: ${prop}`)
      }

      Reflect.set(target, prop, value);
    }
  });
}

enhance.asObject = function asObject(obj) {
  const afterSetKey = '$afterSet';
  const enhanceKeys = [afterSetKey];

  enhanceKeys.forEach(enhanceKey => {
    obj[enhanceKey] = enhance.avoidInsert(obj);
  })

  return new Proxy(obj, {
    set: function (target, prop, value) {
      if (enhanceKeys.includes(prop)) {
        Reflect.set(target, prop, value);
        return true;
      }

      if (!obj.hasOwnProperty(prop)) {
        throw Error(`new propety cannot set: ${prop}`)
      }

      Reflect.set(target, prop, value);
      const listener = obj[afterSetKey][prop];
      if (listener) {
        listener(target, prop, value);
      }
      return true;
    },
    has(target, key) {
      if (enhanceKeys.includes(key)) {
        return false;
      }
      return key in target;
    }
  });
}

enhance.asMap = function asMap(obj) {
  const afterSetKey = '$afterSet';
  const afterDeleteKey = '$afterDelete';
  const enhanceKeys = [afterSetKey, afterDeleteKey];

  enhanceKeys.forEach(enhanceKey => {
    obj[enhanceKey] = {};
  })

  return new Proxy(obj, {
    set: function (target, prop, value) {
      if (enhanceKeys.includes(prop)) {
        Reflect.set(target, prop, value);
        return true;
      }

      Reflect.set(target, prop, value);
      const listener = obj[afterSetKey];
      if (listener) {
        listener(target, prop, value);
      }
      return true;
    },
    deleteProperty: function (target, prop, value) {
      const willDelete = target[prop];
      Reflect.deleteProperty(target, prop, value);
      const listener = obj[afterDeleteKey];
      if (listener) {
        listener(target, prop, willDelete);
      }
      return true;
    },
    has(target, key) {
      if (enhanceKeys.includes(key)) {
        return false;
      }
      return key in target;
    }
  });

}

enhance.asArray = function asArray(array) {
  const afterInsertKey = '$afterInsert';
  const afterUpdateKey = '$afterUpdate';
  const afterDeleteKey = '$afterDelete';
  const enhanceKeys = [afterInsertKey, afterUpdateKey, afterDeleteKey];

  enhanceKeys.forEach(enhanceKey => {
    array[enhanceKey] = enhance.avoidInsert(array);
  })

  return new Proxy(array, {
    deleteProperty: function (target, prop, value) {
      Reflect.deleteProperty(target, prop, value);
      if (!isNaN(prop)) {
        const listener = array[afterDeleteKey];
        if (listener) {
          listener(target, prop, value);
        }
      }
      return true;
    },
    set: function (target, prop, value) {
      if (enhanceKeys.includes(key)) {
        Reflect.set(target, prop, value);
        return true;
      }

      const isInsert = target[prop] === undefined;
      Reflect.set(target, prop, value);
      if (!isNaN(prop)) {
        const key = isInsert ? afterInsertKey : afterUpdateKey;
        const listener = array[key];
        if (listener) {
          listener(target, prop, value);
        }
      }
      return true;
    },
    has(target, key) {
      if (enhanceKeys.includes(key)) {
        return false;
      }
      return key in target;
    }
  });
}

function createRecorder() {
  const SpeechRecognition = window.webkitSpeechRecognition || window.SpeechRecognition;
  const SpeechGrammarList = window.webkitSpeechGrammarList || window.SpeechGrammarList;

  if (!SpeechRecognition) {
    return enhance({
      text: '',
      autoRestart: true,
      enabled: true,
      start: function () {},
      stop: function () {},
      canAutoRestart: function () {
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
    canAutoRestart: function () {
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
    if (instance.canAutoRestart()) {
      instance.start();
    }
  });

  return instance;
}

async function createRoom(peer) {
  const statusLeft = 'left';
  const statusJoining = 'joining';
  const statusJoined = 'joined';

  const callOptions = {
    videoBandwidth: 1
  };

  const textReceiver = enhance({
    body: null,
    src: null
  });

  const distanceReceiver = enhance({
    matrix: {},
    src: null,
    normalizedDistances: function () {
      const peerId2Distance = {};
      for (var rowKey in this.matrix) {
        const row = this.matrix[rowKey];
        if (rowKey == peer.id) {
          if (row) {
            Object.assign(peerId2Distance, row);
          }
          continue;
        }

        const volume = row[peer.id];
        if (volume !== undefined) {
          peerId2Distance[rowKey] = volume;
        }
      }
      console.log(`peerId2Distance: ${peerId2Distance}`);
      return peerId2Distance;
    }
  })

  const protocols = {
    text: {
      send: function (text) {
        room.send({
          type: 'text',
          body: text
        });
      },
      receive: function ({
        data,
        src
      }) {
        if (data.type != 'text') {
          throw `Illegal type expect: text, got: ${data.type}`
        }
        textReceiver.src = src;
        textReceiver.body = data.body;
      }
    },
    distance: {
      send: function (matrix) {
        room.send({
          type: 'distance',
          matrix: matrix
        });
      },
      receive: function ({
        data,
        src
      }) {
        if (data.type != 'distance') {
          throw `Illegal type expect: distance, got: ${data.type}`
        }
        distanceReceiver.src = src;
        distanceReceiver.matrix = data.matrix;
      }
    },
    dispatch: function (pack) {
      console.log(pack);
      const protocolType = this[pack.data.type];
      if (protocolType === undefined) {
        throw `Illegal protocol type: ${pack.data.type}`
      }
      protocolType.receive(pack);
    }
  }

  const peers = enhance.asMap({});

  function join(roomId, localStream, mode = 'mesh') {
    // Note that you need to ensure the peer has connected to signaling server
    // before using methods of peer instance.
    if (!peer.open) {
      return;
    }

    const roomOptions = Object.assign({
      mode: mode,
      stream: localStream
    }, callOptions);

    room = peer.joinRoom(roomId, roomOptions);
    instance.status = statusJoining;

    room.once('open', () => {
      instance.status = statusJoined
    });
    room.on('peerJoin', peerId => {
      console.log(`peerJoin: === ${peerId} が入室しました ===`);
    });

    // Render remote stream for new peer join in the room
    room.on('stream', async stream => {
      peers[stream.peerId] = stream;
    });

    room.on('data', (pack) => {
      protocols.dispatch(pack);
    });

    // for closing room members
    room.on('peerLeave', peerId => {
      delete peers[peerId];
    });

    // for closing myself
    room.once('close', () => {
      instance.status = statusLeft;
    });
  }

  var room = null;
  const instance = enhance({
    status: statusLeft,
    localText: '',
    textReceiver: textReceiver,
    distanceReceiver: distanceReceiver,
    peers: peers,
    join: join,
    isJoined: function () {
      return this.status == statusJoined;
    },
    isJoining: function () {
      return this.status == statusJoining;
    },
    close: function () {
      room.close()
    },
    sendMessage: function (text) {
      protocols.text.send(text)
    },
    nearTo: function (peerId) {
      const matrix = {};
      const subMatrix = {};
      subMatrix[peerId] = 0;
      matrix[peer.id] = subMatrix;

      protocols.distance.send(matrix);
    }
  });

  return instance;
}

(async function main() {
  function createVideoPanels(room) {
    class VideoPanel {

      constructor(stream) {
        const peerId = stream.peerId;

        const panel = appendTo()
        panel.setAttribute('data-peer-id', peerId);

        const video = panel.getElementsByTagName('video')[0];
        video.srcObject = stream;
        video.playsInline = true;
        video.volume = 0.2;
        remoteVideos.append(panel);
        video.play().catch(console.error);

        panel.getElementsByClassName('peer-id')[0].innerText = peerId;
        panel.getElementsByClassName('near-to')[0].addEventListener('click', function () {
          room.nearTo(peerId);
        });

        this.video = video;
        this.peerId = peerId;
      }

      setVolume(value) {
        console.log(`setVolume: ${value}`);

        if (value < 0 || 1 < value) {
          throw `Volume out of range(0 to 1.0): ${value}`
        }
        this.video.volume = value;
      }

      remove() {
        const remoteVideoPanel = document.querySelector(
          `[data-peer-id="${this.peerId}"]`
        );

        const remoteVideo = remoteVideoPanel.getElementsByTagName('video')[0];
        remoteVideo.srcObject.getTracks().forEach(track => track.stop());
        remoteVideo.srcObject = null;
        remoteVideoPanel.remove();
      }
    }

    const videoPanels = {};

    return {
      get: function (peerId) {
        const panel = videoPanels[peerId];
        if (!panel) {
          throw `panel not found. peerId: ${peerId}`
        }
        return panel;
      },
      append: function (stream) {
        const videoPanel = new VideoPanel(stream);
        videoPanels[stream.peerId] = videoPanel;
      },
      remove: function (peerId) {
        videoPanels[peerId].remove();
        delete videoPanels[peerId];
      },
      removeAll: function () {
        for (var key in videoPanels) {
          if (!videoPanels.hasOwnProperty(key)) {
            continue;
          }
          const remoteVideoPanel = videoPanels[key];
          remoteVideoPanel.remove();
        };
        for (var key in videoPanels) {
          if (!videoPanels.hasOwnProperty(key)) {
            continue;
          }
          delete videoPanels[key];
        }
      }
    }
  }

  const callPanelTemplate = document.getElementById('callPanelTemplate').innerText;

  function appendTo() {
    const callPanels = remoteVideos;
    callPanels.insertAdjacentHTML('beforeend', callPanelTemplate);
    return callPanels.querySelector('.call-panel:last-child');
  }

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

  if (!mediaDevices) {
    alert('このデバイスではご利用できません。ブラウザが古いか、モバイルの場合にはHTTPSで無いと動作しない可能性が高いです。');
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
  const videoPanels = createVideoPanels(room);

  // Register join handler
  joinTrigger.addEventListener('click', () => {
    if (roomId.value === "") {
      alert('Room Nameを入れてください');
      return;
    }

    room.join(roomId.value, localStream, getRoomModeByHash());
  });

  sendTrigger.addEventListener('click', () => {
    room.sendMessage(localText.value);
    room.localText = localText.value;
    localText.value = '';
  });

  leaveTrigger.addEventListener('click', () => room.close());

  room.$afterSet.localText = function (target, prop, value) {
    if (value !== '') {
      appendMessage(`${peer.id}: ${value}`);
    }
  }

  room.$afterSet.status = function (target, prop, value) {
    if (target.isJoining()) {
      appendMessage('=== 入室待ちです... ===');

      document.body.classList.add("joining");
      document.body.classList.remove("left");
    } else if (target.isJoined()) {
      appendMessage('=== 入室しました ===');
      recorder.autoRestart = true
      recorder.start();

      document.body.classList.remove("left");
      document.body.classList.remove("joining");
    } else {
      appendMessage('== 退室しました ===');
      recorder.autoRestart = false
      recorder.stop();

      videoPanels.removeAll();

      document.body.classList.add("left");
      document.body.classList.remove("joining");
    }
  }

  room.peers.$afterSet = function (target, prop, value) {
    const stream = value;
    appendMessage(`=== ${stream.peerId} が入室しました ===`);

    videoPanels.append(stream);
  }

  room.peers.$afterDelete = function (target, prop, value) {
    const peerId = value.peerId;
    videoPanels.remove(peerId);
    appendMessage(`=== ${peerId} が退室しました ===`);
  }

  room.textReceiver.$afterSet.body = function (target, prop, value) {
    appendMessage(`${target.src}: ${target.body}`);
  }

  room.distanceReceiver.$afterSet.matrix = function (target, prop, value) {
    const peerId2Distance = target.normalizedDistances();
    for (var peerId in peerId2Distance) {
      const videoPanel = videoPanels.get(peerId);
      videoPanel.setVolume(1 - peerId2Distance[peerId]);
    }
  }

  recorder.$afterSet.text = function (target, prop, value) {
    console.log('text event!')

    appendMessage(value);
    room.sendMessage(value);

    if (value == "さよなら" || value == "バイバイ") {
      // 側によるを作ったら、「xxxちょっといい？」でxxxさんに寄る
      const closeMessage = '[コマンド一致！]退室します\n';
      appendMessage(closeMessage);
      room.sendMessage(closeMessage);
      room.close();
    }
  }
})();