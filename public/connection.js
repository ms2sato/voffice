const getRoomModeByHash = () => (location.hash === '#sfu' ? 'sfu' : 'mesh');

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

  const _textReceiver = enhance({
    body: null,
    src: null
  });

  const _distanceReceiver = enhance({
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

  const _protocols = {
    text: {
      send: function (text) {
        _room.send({
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
        _textReceiver.src = src;
        _textReceiver.body = data.body;
      }
    },
    distance: {
      send: function (matrix) {
        _room.send({
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
        _distanceReceiver.src = src;
        _distanceReceiver.matrix = data.matrix;

        const peerId2Distance = _distanceReceiver.normalizedDistances();
        for (var peerId in peerId2Distance) {
          const peer = _peers[peerId];
          if(peer == undefined) { continue; }
          peer.distance = peerId2Distance[peerId]
        }
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

  const _peers = enhance.asMap({});
  function newPeer(stream) {
    _peers[stream.peerId] = enhance({
      stream: stream,
      distance: 0.8
    });
  }

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

    _room = peer.joinRoom(roomId, roomOptions);
    instance.status = statusJoining;

    _room.once('open', () => {
      instance.status = statusJoined
    });
    _room.on('peerJoin', peerId => {
      console.log(`peerJoin: === ${peerId} が入室しました ===`);
    });

    _room.on('stream', async stream => {
      newPeer(stream)
    });

    _room.on('data', (pack) => {
      _protocols.dispatch(pack);
    });

    _room.on('peerLeave', peerId => {
      delete _peers[peerId];
    });

    // for closing myself
    _room.once('close', () => {
      instance.status = statusLeft;
    });
  }

  var _room = null;
  const instance = enhance({
    status: statusLeft,
    localText: '',
    textReceiver: _textReceiver,
    distanceReceiver: _distanceReceiver,
    peers: _peers,
    join: join,
    isJoined: function () {
      return this.status == statusJoined;
    },
    isJoining: function () {
      return this.status == statusJoining;
    },
    close: function () {
      _room.close()
    },
    sendMessage: function (text) {
      _protocols.text.send(text)
    },
    moveTo: function(peerId, distance) {
      _peers[peerId].distance = distance;

      const matrix = {};
      const subMatrix = {};
      subMatrix[peerId] = distance;
      matrix[peer.id] = subMatrix;

      _protocols.distance.send(matrix);
    },
    nearTo: function (peerId) {
      this.moveTo(peerId, 0);
    },
    farFrom: function(peerId) {
      this.moveTo(peerId, 0.8);
    }
  });

  return instance;
}

(async function main() {
  function createVideoPanels(room) {
    class VideoPanel {

      constructor(peer) {
        this.peer = peer;
        const stream = peer.stream;
        const peerId = stream.peerId;

        const panel = appendTo()
        panel.setAttribute('data-peer-id', peerId);

        const video = panel.getElementsByTagName('video')[0];
        this.video = video;
        video.srcObject = stream;
        video.playsInline = true;
        remoteVideos.append(panel);
        this.setVolume(peer.distance);
        video.play().catch(console.error);

        panel.getElementsByClassName('peer-id')[0].innerText = peerId;
        panel.getElementsByClassName('near-to')[0].addEventListener('click', function () {
          room.nearTo(peerId);
        });
        panel.getElementsByClassName('far-from')[0].addEventListener('click', function () {
          room.farFrom(peerId);
        });

        const distancePanel = panel.getElementsByClassName('distance')[0];
        distancePanel.innerText = peer.distance;

        const _this = this;
        peer.$afterSet.distance = function(target, prop, value) {
          _this.setVolume(1 - value);
          distancePanel.innerText = value
        }
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
          `[data-peer-id="${this.peer.stream.id}"]`
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
      append: function (peer) {
        const videoPanel = new VideoPanel(peer);
        videoPanels[peer.stream.peerId] = videoPanel;
      },
      remove: function (peerId) {
        if(videoPanels[peerId] === undefined) { return; }

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
    const stream = value.stream;
    appendMessage(`=== ${stream.peerId} が入室しました ===`);
    videoPanels.append(value);
  }

  room.peers.$afterDelete = function (target, prop, value) {
    const peerId = value.peerId;
    videoPanels.remove(peerId);
    appendMessage(`=== ${peerId} が退室しました ===`);
  }

  room.textReceiver.$afterSet.body = function (target, prop, value) {
    appendMessage(`${target.src}: ${target.body}`);
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