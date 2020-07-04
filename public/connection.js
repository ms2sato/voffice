(async function main() {
  function createRecorder() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      return enhance({
        text: '',
        autoRestart: true,
        enabled: false,
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
      enabled: true,
      start: function () {
        if(!this.enabled) { throw Error('Cannot call when disabled'); }
        console.log('recorder start');
        speech.start();
      },
      stop: function () {
        if(!this.enabled) { throw Error('Cannot call when disabled'); }
        console.log('recorder stop');
        speech.stop();
      },
      canAutoRestart: function () {
        return this.autoRestart && this.enabled
      },
      enable: function(value) {
        if(this.enabled === value) { return }

        if(value) {
          this.enabled = true;
          this.start();
        } else {
          this.stop();
          this.enabled = false;
        }
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

  function createRoom(peer) {
    const statusLeft = 'left';
    const statusJoining = 'joining';
    const statusJoined = 'joined';

    const nearDistance = 0;
    const farDistance = 0.9;

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
    });

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
        sendPair: function (lhPeerId, rhPeerId, distance) {
          const matrix = {};
          const subMatrix = {};
          subMatrix[rhPeerId] = distance;
          matrix[lhPeerId] = subMatrix;
          this.send(matrix);
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
            const peer = instance.peers[peerId];
            if (peer == undefined) {
              continue;
            }
            peer.distance = peerId2Distance[peerId]
          }
        }
      },
      face: {
        send: function (dataUrl) {
          _room.send({
            type: 'face',
            image: dataUrl
          })
        },
        receive: function ({
          data,
          src
        }) {
          if (data.type != 'face') {
            throw `Illegal type expect: face, got: ${data.type}`
          }
          if (!data.image.match(/^data:image\/jpeg;base64,[\w\/=+]+$/)) {
            throw `Illegal image: ${data.image}`;
          }
          const peer = findOrCreatePeer(src);
          if (peer) {
            peer.face = data.image;
          }
        }
      },
      dispatch: function (pack) {
        const protocolType = this[pack.data.type];
        if (protocolType === undefined) {
          throw `Illegal protocol type: ${pack.data.type}`
        }
        protocolType.receive(pack);
      }
    }

    function createPeer(peerId) {
      return enhance({
        id: peerId,
        stream: null,
        distance: farDistance,
        face: "",
        nearTo: function () {
          this.distance = nearDistance;
          _protocols.distance.sendPair(peer.id, this.stream.peerId, this.distance);
        },
        farFrom: function () {
          this.distance = farDistance;
          _protocols.distance.sendPair(peer.id, this.stream.peerId, this.distance);
        }
      });
    }

    function findOrCreatePeer(peerId) {
      if (!instance.peers[peerId]) {
        instance.peers[peerId] = createPeer(peerId);
      }
      return instance.peers[peerId];
    }

    function join(roomId, localStream, mode = 'mesh') {
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
        findOrCreatePeer(peerId);
      });

      _room.on('stream', async stream => {
        findOrCreatePeer(stream.peerId).stream = stream;
      });

      _room.on('data', (pack) => {
        _protocols.dispatch(pack);
      });

      _room.on('peerLeave', peerId => {
        delete instance.peers[peerId];
      });

      _room.once('close', () => {
        instance.peers.$clear();
        instance.status = statusLeft;
      });
    }

    var _room = null;
    const instance = enhance({
      nearDistance: nearDistance,
      farDistance: farDistance,
      status: statusLeft,
      localText: '',
      textReceiver: _textReceiver,
      distanceReceiver: _distanceReceiver,
      peers: enhance.asMap({}),
      myFaceImageUrl: null,
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
      replaceStream: function (stream) {
        _room.replaceStream(stream);
      },
      sendMessage: function (text) {
        _protocols.text.send(text)
      },
      sendMyFace: function () {
        if (this.myFaceImageUrl) {
          _protocols.face.send(this.myFaceImageUrl);
        }
      },
      moveTo: function (peerId, distance) {
        instance.peers[peerId].distance = distance;
      },
      nearTo: function (peerId) {
        instance.peers[peerId].nearTo();
      },
      farFrom: function (peerId) {
        instance.peers[peerId].farFrom();
      },
      setMyFace: function (faceUrl) {
        const isBlack = faceUrl.match(/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAA/);
        let ret = false;
        if (!isBlack) {
          this.myFaceImageUrl = faceUrl;
          ret = true;
        }

        if (this.isJoined()) {
          this.sendMyFace();
        }
        return ret;
      }
    });

    return instance;
  }

  function voiceFilter(stream) {
    // return new MediaStream(stream.getAudioTracks());

    const type2num = {
      'lowpass': 0,
      'highpass': 1,
      'lowshelf': 3,
      'highshelf': 4,
      'peaking': 5
    };

    function createFilter(params) {
      const filter = context.createBiquadFilter();
      filter.type = (typeof filter.type === 'string') ? params.type : type2num[params.type];
      filter.frequency.value = params.frequency;

      if (params.gain != undefined) {
        filter.gain.value = params.gain;
      }
      return filter;
    }

    const context = new(window.AudioContext || window.webkitAudioContext)();

    const paramsList = [{
        type: 'lowpass',
        frequency: 8000
      },
      {
        type: 'highpass',
        frequency: 100
      },
      {
        type: 'lowshelf',
        frequency: 110,
        gain: -2
      },
      {
        type: 'lowshelf',
        frequency: 200,
        gain: -1
      },
      {
        type: 'peaking',
        frequency: 500,
        gain: 4
      },
      {
        type: 'peaking',
        frequency: 1000,
        gain: 5
      },
      {
        type: 'highshelf',
        frequency: 1800,
        gain: 1
      },
      {
        type: 'highshelf',
        frequency: 4000,
        gain: -3
      },
      {
        type: 'highshelf',
        frequency: 6000,
        gain: -4
      },
    ];

    let target = context.createMediaStreamSource(stream);
    paramsList.forEach(function (params) {
      const nextFilter = createFilter(params);
      target.connect(nextFilter);
      target = nextFilter;
    });

    const output = context.createMediaStreamDestination();
    target.connect(output);
    return output.stream;
  }

  function createMedia(width, height) {
    const statuses = {
      stop: 'stop',
      stopping: 'stoppping',
      booting: 'booting',
      online: 'online'
    };

    const audioConstraints = {
      sampleRate: {
        ideal: 48000
      },
      sampleSize: {
        ideal: 16
      },
      echoCancellation: true,
      echoCancellationType: 'system',
      noiseSuppression: false,
      latency: 1,
    };

    const videoConstraints = {
      width: width,
      height: height,
      frameRate: 0.1,
      facingMode: "user"
    };

    const mediaDevices = navigator.mediaDevices ||
      navigator.webkitGetUserMedia ||
      navigator.mozGetUserMedia ||
      navigator.msGetUserMedia;

    if (!mediaDevices) {
      alert('このデバイスではご利用できません。ブラウザが古いか、モバイルの場合にはHTTPSで無いと動作しない可能性が高いです。');
      return;
    }

    async function drawFace() {
      if (!instance.videoStream) {
        return;
      }

      let localVideo = document.createElement('video');
      localVideo.muted = true;
      localVideo.playsInline = true;
      localVideo.srcObject = instance.videoStream;
      await localVideo.play().catch(console.error);

      instance.handleDrawFace(localVideo);
      localVideo.pause();
      localVideo.srcObject = null;
      localVideo.remove();
      localVideo = null;

      setTimeout(drawFace, 5000);
    }

    async function getUserMedia(audioConstraints, videoConstraints) {
      return mediaDevices.getUserMedia({
        audio: audioConstraints,
        video: videoConstraints
      }).catch(console.error)
    }

    function stopStream(stream) {
      stream.getTracks().forEach(function (track) {
        track.stop();
      });
    }

    function enableStream(stream, value) {
      stream.getTracks().forEach(function (track) {
        track.enabled = value
      });
    }

    const instance = enhance({
      statuses: statuses,
      statusList: function () {
        return Object.keys(this.statuses)
      },
      videoStatus: statuses.stop,
      audioStream: null,
      videoStream: null,
      enabledVideo: true,
      enabledAudio: true,
      initialize: async function () {
        if (this.audioStream || this.videoStream) {
          throw 'already initialized';
        }

        this.videoStatus = statuses.booting;
        const localStream = await getUserMedia(audioConstraints, videoConstraints);
        this.videoStatus = statuses.online;

        this.videoStream = localStream;
        this.audioStream = voiceFilter(localStream);

        this.startDrawFace();
      },
      startDrawFace: function () {
        drawFace();
      },
      handleDrawFace: function (_tempVideo) {
        /* nop */
      },
      enableAudio: function(value) {
        if (this.enabledAudio == value) {
          return;
        }
        enableStream(this.audioStream, value);
        this.enabledAudio = value;
      },
      enableVideo: async function (value) {
        if (this.enabledVideo == value) {
          return;
        }

        if (value) {
          this.videoStatus = statuses.booting;
          const localStream = await getUserMedia(audioConstraints, videoConstraints);

          const oldAudioStream = this.audioStream;

          this.videoStream = localStream;
          this.audioStream = voiceFilter(localStream);

          stopStream(oldAudioStream);

          this.startDrawFace();
          this.videoStatus = statuses.online;
        } else {
          this.videoStatus = statuses.stopping;
          const localStream = await getUserMedia(audioConstraints, false);

          const oldVideoStream = this.videoStream;
          const oldAudioStream = this.audioStream;

          this.videoStream = null;
          this.audioStream = voiceFilter(localStream);

          stopStream(oldVideoStream);
          stopStream(oldAudioStream);

          this.videoStatus = statuses.stop;
        }

        this.enabledVideo = value;
      }
    });

    return instance;
  }

  function createVideoPanels(room) {
    const callPanelTemplate = document.getElementById('callPanelTemplate').innerText;

    function appendRemotePanel() {
      return appendHtmlTo(remoteVideos, callPanelTemplate)
    }

    class VideoPanel {

      constructor(peer) {
        this.peer = peer;
        const peerId = peer.id;

        const panel = appendRemotePanel();
        panel.setAttribute('data-peer-id', peerId);
        const nearFarSwitcher = createElementStatusSwitcher(panel, ['far', 'near']);

        const video = panel.getElementsByClassName('js-remote-stream')[0];
        this.video = video;
        video.playsInline = true;
        remoteVideos.append(panel);
        this.setVolumeFromDistance(peer.distance);

        panel.getElementsByClassName('peer-id')[0].innerText = peerId;

        panel.getElementsByClassName('near-to')[0].addEventListener('click', function () {
          room.nearTo(peerId);
        });

        panel.getElementsByClassName('far-from')[0].addEventListener('click', function () {
          room.farFrom(peerId);
        });

        panel.getElementsByClassName('js-remote-canvas')[0].addEventListener('click', function () {
          if (peer.distance == room.nearDistance) {
            room.farFrom(peerId);
          } else {
            room.nearTo(peerId);
          }
        });

        const distancePanel = panel.getElementsByClassName('distance')[0];
        distancePanel.innerText = peer.distance;

        const _this = this;
        peer.$afterSet.stream = function (peer, prop, stream) {
          video.srcObject = stream;
          video.play().catch(console.error);
        }

        peer.$afterSet.distance = function (peer, prop, distance) {
          _this.setVolumeFromDistance(distance);
          distancePanel.innerText = distance

          if (distance == room.nearDistance) {
            nearFarSwitcher.near();
            appendMessage(`=== ${peerId} と近づきました ===`);
          } else if (distance == room.farDistance) {
            nearFarSwitcher.far();
            appendMessage(`=== ${peerId} と離れました ===`);
          }
        }

        peer.$afterSet.face = function (peer, prop, face) {
          const img = panel.getElementsByClassName('js-remote-canvas')[0];
          img.src = face;
        }

        room.sendMyFace();
      }

      setVolumeFromDistance(distance) {
        this.setVolume(1 - distance);
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
          `[data-peer-id="${this.peer.id}"]`
        );

        const remoteVideo = remoteVideoPanel.getElementsByClassName('js-remote-stream')[0];
        if(remoteVideo.srcObject) {
          remoteVideo.srcObject.getTracks().forEach(track => track.stop());
          remoteVideo.srcObject = null;
          }
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
        videoPanels[peer.id] = videoPanel;
      },
      remove: function (peerId) {
        if (videoPanels[peerId] === undefined) {
          return;
        }

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

  function createElementStatusSwitcher(elm, classes) {
    const instance = {};
    classes.forEach((cls) => {
      instance[cls] = function () {
        classes.forEach((clz) => {
          if (cls === clz) {
            elm.classList.add(clz);
          } else {
            elm.classList.remove(clz);
          }
        })
      }
    });
    instance[classes[0]]();
    return instance;
  }

  function appendHtmlTo(parent, template) {
    parent.insertAdjacentHTML('beforeend', template.trim());
    return parent.lastChild;
  }

  const messages = document.getElementById('js-messages');
  const joinTrigger = document.getElementById('js-join-trigger');
  const leaveTrigger = document.getElementById('js-leave-trigger');
  const remoteVideos = document.getElementById('js-remote-streams');
  const roomId = document.getElementById('js-room-id');
  const localText = document.getElementById('js-local-text');
  const sendTrigger = document.getElementById('js-send-trigger');
  const enableVideoCheck = document.getElementById('js-enable-video');
  const enableAudioCheck = document.getElementById('js-enable-audio');
  const localCanvas = document.getElementById('js-local-canvas');

  const localCanvasWidth = localCanvas.getAttribute('width');
  const localCanvasHeight = localCanvas.getAttribute('height');

  const context = localCanvas.getContext("2d");
  context.filter = "blur(2px)";

  const urlParams = new URLSearchParams(window.location.search);
  const roomKey = urlParams.get('room');
  if (roomKey != undefined) {
    roomId.value = roomKey;
  }

  function appendMessage(text) {
    const line = appendHtmlTo(messages, '<li></li>');
    line.innerText = text;
    setTimeout(function () {
      window.scrollTo(0, document.body.scrollHeight);
    }, 100);
  }

  function sendLocalTextMessage() {
    if (localText.value.match(/^\s*$/)) {
      return;
    }

    room.sendMessage(localText.value);
    room.localText = localText.value;
    localText.value = '';
    localText.setAttribute("rows", 1);
  }

  const Peer = window.Peer;
  const peer = (window.peer = new Peer({
    key: window.__SKYWAY_KEY__,
    debug: 3,
  }));

  peer.on('error', console.error);

  const media = createMedia(localCanvasWidth, localCanvasHeight);
  const recorder = createRecorder();
  const room = createRoom(peer);
  const videoPanels = createVideoPanels(room);

  const mediaStatusSwitcher = createElementStatusSwitcher(document.body, media.statusList());
  const roomStatusSwitcher = createElementStatusSwitcher(document.body, ['left', 'joining', 'join']);

  media.handleDrawFace = function (tempVideo) {
    context.drawImage(tempVideo, 0, 0, localCanvasWidth, localCanvasHeight);

    const faceUrl = localCanvas.toDataURL('image/jpeg', 0.3);
    if (room.setMyFace(faceUrl)) {
      document.body.classList.remove('without-my-face');
    }
  }

  joinTrigger.addEventListener('click', () => {
    if (roomId.value === "") {
      alert('Room Nameを入れてください');
      return;
    }

    room.join(roomId.value, media.audioStream, 'sfu');
  });

  sendTrigger.addEventListener('click', () => {
    sendLocalTextMessage();
  });

  localText.addEventListener('keydown', function () {
    if (event.key === "Enter") {
      if (event.isComposing) {
        return;
      }

      if (event.shiftKey) {
        const rows = parseInt(this.getAttribute("rows"));
        if (rows < 10) {
          this.setAttribute("rows", rows + 1);
        }
      } else {
        sendLocalTextMessage();
      }
    }
  });

  leaveTrigger.addEventListener('click', () => room.close());

  enableVideoCheck.addEventListener('click', function () {
    media.enableVideo(this.checked);
  });

  enableAudioCheck.addEventListener('click', function () {
    media.enableAudio(this.checked);
  });

  media.$afterSet.videoStatus = function (target, prop, value) {
    if (value == media.statuses.stop) {
      appendMessage('== 動画キャプチャを停止しました ==')
      mediaStatusSwitcher.stop();
    }
    if (value == media.statuses.stopping) {
      appendMessage('== 動画キャプチャを停止中... ==')
      mediaStatusSwitcher.stopping();
    }
    if (value == media.statuses.booting) {
      appendMessage('== 動画キャプチャを初期化中... ==')
      mediaStatusSwitcher.booting();
    }
    if (value == media.statuses.online) {
      appendMessage('== 動画キャプチャを開始しました ==')
      mediaStatusSwitcher.online();
    }
  }

  media.$afterSet.enabledAudio = function(target, prop, value) {
    recorder.enable(value);
  }

  media.$afterSet.audioStream = function (target, prop, value) {
    if (room.isJoined() && target.audioStream) {
      room.replaceStream(target.audioStream);
    }
  }

  room.$afterSet.localText = function (target, prop, value) {
    if (value !== '') {
      appendMessage(`${peer.id}: ${value}`);
    }
  }

  room.$afterSet.status = function (target, prop, value) {
    if (target.isJoining()) {
      appendMessage('=== 入室待ちです... ===');

      roomStatusSwitcher.joining();
    } else if (target.isJoined()) {
      appendMessage('=== 入室しました ===');

      if(recorder.enabled) {
        recorder.autoRestart = true;
        recorder.start();
       }

      roomStatusSwitcher.join();
      room.sendMyFace();
    } else {
      appendMessage('== 退室しました ===');

      if(recorder.enabled) {
        recorder.autoRestart = false
        recorder.stop();
      }

      videoPanels.removeAll();

      roomStatusSwitcher.left();
    }
  }

  room.peers.$afterSet = function (pears, peerId, peer) {
    appendMessage(`=== ${peerId} が接続しました ===`);
    videoPanels.append(peer);
  }

  room.peers.$afterDelete = function (target, prop, value) {
    const peerId = prop;
    videoPanels.remove(peerId);
    appendMessage(`=== ${peerId} が切断しました ===`);
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

  media.initialize();
  enableVideoCheck.checked = media.enabledVideo;
  enableAudioCheck.checked = media.enabledAudio;
})();