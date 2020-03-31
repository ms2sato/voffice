(async function main() {
  function createRecorder() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const SpeechGrammarList = window.SpeechGrammarList || window.webkitSpeechGrammarList;

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

  function createRoom(peer) {
    const statusLeft = 'left';
    const statusJoining = 'joining';
    const statusJoined = 'joined';

    const nearDistance = 0;
    const farDistance = 0.8;

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
            const peer = _peers[peerId];
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
          const peer = _peers[src];
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

    const _peers = enhance.asMap({});

    function createPeer(stream) {
      return enhance({
        stream: stream,
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
        _peers[stream.peerId] = createPeer(stream);
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
      nearDistance: nearDistance,
      farDistance: farDistance,
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
      sendFace: function (dataUrl) {
        _protocols.face.send(dataUrl);
      },
      moveTo: function (peerId, distance) {
        _peers[peerId].distance = distance;
      },
      nearTo: function (peerId) {
        _peers[peerId].nearTo();
      },
      farFrom: function (peerId) {
        _peers[peerId].farFrom();
      }
    });

    return instance;
  }

  function voiceFilter(stream) {
    // return new MediaStream(stream.getAudioTracks());


    let context = new(window.AudioContext || window.webkitAudioContext)();
    let mic = context.createMediaStreamSource(stream);
    let output = context.createMediaStreamDestination();

    // Create the instance of BiquadFilterNode
    let sbass = context.createBiquadFilter();
    let bass = context.createBiquadFilter();
    let middle1 = context.createBiquadFilter();
    let middle2 = context.createBiquadFilter();
    let treble1 = context.createBiquadFilter();
    let treble2 = context.createBiquadFilter();
    let treble3 = context.createBiquadFilter();
    let lowpass = context.createBiquadFilter();
    let highpass = context.createBiquadFilter();

    // Set type
    sbass.type = (typeof bass.type === 'string') ? 'lowshelf' : 3;
    bass.type = (typeof bass.type === 'string') ? 'lowshelf' : 3;
    middle1.type = (typeof middle1.type === 'string') ? 'peaking' : 5;
    middle2.type = (typeof middle2.type === 'string') ? 'peaking' : 5;
    treble1.type = (typeof treble1.type === 'string') ? 'highshelf' : 4;
    treble2.type = (typeof treble2.type === 'string') ? 'highshelf' : 4;
    treble3.type = (typeof treble3.type === 'string') ? 'highshelf' : 4;
    lowpass.type = (typeof lowpass.type === 'string') ? 'lowpass' : 0;
    highpass.type = (typeof highpass.type === 'string') ? 'highpass' : 1;

    // Set frequency
    lowpass.frequency.value = 8000;
    highpass.frequency.value = 100;
    sbass.frequency.value = 0.1;
    bass.frequency.value = 200;
    middle1.frequency.value = 600;
    middle2.frequency.value = 1000;
    treble1.frequency.value = 1800;
    treble2.frequency.value = 4000;
    treble3.frequency.value = 6000;

    // Set Q (Quality Factor)
    // bass.Q.value   = Math.SQRT1_2;  // Not used
    middle1.Q.value = Math.SQRT1_2;
    middle2.Q.value = Math.SQRT1_2;
    // treble.Q.value = Math.SQRT1_2;  // Not used
    lowpass.Q.value = 0.2;
    highpass.Q.value = 0.7;

    // Initialize Gain
    sbass.gain.value = -1;
    bass.gain.value = 1;
    middle1.gain.value = 3;
    middle2.gain.value = 2;
    treble1.gain.value = 1;
    treble2.gain.value = 0;
    treble3.gain.value = -2;

    mic.connect(lowpass);
    lowpass.connect(highpass);
    highpass.connect(sbass);
    sbass.connect(bass);
    bass.connect(middle1);
    middle1.connect(middle2);
    middle2.connect(treble1);
    treble1.connect(treble2);
    treble2.connect(treble3);
    treble3.connect(output);

    return output.stream;
  }

  function createMedia(width, height) {
    const statuses = {
      stop: 'stop',
      booting: 'booting',
      online: 'online'
    };

    const audioConstraints = {
      sampleRate: {
        ideal: 32000
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
      frameRate: 0.05,
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

      setTimeout(drawFace, 3000);
    }

    const instance = enhance({
      statuses: statuses,
      videoStatus: statuses.stop,
      audioStream: null,
      videoStream: null,
      initialize: async function () {
        if (this.audioStream || this.videoStream) {
          throw 'already initialized';
        }

        this.videoStatus = statuses.booting;
        const [videoStream, audioStream] = await Promise.all([
          mediaDevices.getUserMedia({
            audio: false,
            video: videoConstraints
          }),
          mediaDevices.getUserMedia({
            audio: audioConstraints,
            video: false
          })
        ]).catch(console.error)

        this.videoStatus = statuses.online;
        this.videoStream = videoStream;
        this.audioStream = voiceFilter(audioStream);

        this.startDrawFace();
      },
      startDrawFace: function () {
        drawFace();
      },
      handleDrawFace: function (_tempVideo) {
        /* nop */
      },
      enableVideo: function (value) {
        const _this = this;
        if (this.enabledVideo == value) {
          return;
        }

        if (value) {
          this.videoStatus = statuses.booting;
          mediaDevices.getUserMedia({
            audio: false,
            video: videoConstraints
          }).then(function (videoStream) {
            _this.videoStream = videoStream;
            _this.videoStatus = statuses.online;
            _this.startDrawFace();
          }).catch(console.error);
        } else {
          this.videoStream.getTracks().forEach(function (track) {
            track.stop();
          });
          this.videoStatus = statuses.stop;
          this.videoStream = null;
        }
      }
    });

    return instance;
  }

  function createVideoPanels(room) {
    class VideoPanel {

      constructor(peer) {
        this.peer = peer;
        const stream = peer.stream;
        const peerId = stream.peerId;

        const panel = appendTo();
        panel.setAttribute('data-peer-id', peerId);
        const nearFarSwitcher = createElementStatusSwitcher(panel, ['far', 'near']);

        const video = panel.getElementsByClassName('js-remote-stream')[0];
        this.video = video;
        video.srcObject = stream;
        video.playsInline = true;
        remoteVideos.append(panel);
        this.setVolumeFromDistance(peer.distance);
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
          `[data-peer-id="${this.peer.stream.peerId}"]`
        );

        const remoteVideo = remoteVideoPanel.getElementsByClassName('js-remote-stream')[0];
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
      instance[cls] = function() {
        classes.forEach((clz) => {
          if(cls === clz) {
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

  const callPanelTemplate = document.getElementById('callPanelTemplate').innerText;

  function appendTo() {
    const callPanels = remoteVideos;
    callPanels.insertAdjacentHTML('beforeend', callPanelTemplate);
    return callPanels.querySelector('.remote-panel:last-child');
  }

  const messages = document.getElementById('js-messages');
  const joinTrigger = document.getElementById('js-join-trigger');
  const leaveTrigger = document.getElementById('js-leave-trigger');
  const remoteVideos = document.getElementById('js-remote-streams');
  const roomId = document.getElementById('js-room-id');
  const localText = document.getElementById('js-local-text');
  const sendTrigger = document.getElementById('js-send-trigger');
  const saveModeCheck = document.getElementById('js-save-mode');
  const localCanvas = document.getElementById('js-local-canvas');

  const localCanvasWidth = localCanvas.getAttribute('width');
  const localCanvasHeight = localCanvas.getAttribute('height');

  const context = localCanvas.getContext("2d");
  context.filter = "blur(2px)";

  function appendMessage(text) {
    messages.textContent += `${text}\n`;
    setTimeout(function () {
      window.scrollTo(0, document.body.scrollHeight);
    }, 100);
  }

  const roomStatusSwitcher = createElementStatusSwitcher(document.body, ['left', 'joining', 'join']);

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

  media.handleDrawFace = function (tempVideo) {
    context.drawImage(tempVideo, 0, 0, localCanvasWidth, localCanvasHeight);

    if (room.isJoined()) {
      room.sendFace(localCanvas.toDataURL('image/jpeg', 0.3));
    }
  }

  joinTrigger.addEventListener('click', () => {
    if (roomId.value === "") {
      alert('Room Nameを入れてください');
      return;
    }

    room.join(roomId.value, media.audioStream, 'sfu');
  });

  function sendLocalTextMessage() {
    if (localText.value.match(/^\s*$/)) {
      return;
    }

    room.sendMessage(localText.value);
    room.localText = localText.value;
    localText.value = '';
    localText.setAttribute("rows", 1);
  }

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

  saveModeCheck.addEventListener('click', function () {
    media.enableVideo(!this.checked);
  });

  media.$afterSet.videoStatus = function (target, prop, value) {
    if (value == media.statuses.stop) {
      appendMessage('== 動画キャプチャを停止しました ==')
    }
    if (value == media.statuses.booting) {
      appendMessage('== 動画キャプチャを初期化中... ==')
    }
    if (value == media.statuses.online) {
      appendMessage('== 動画キャプチャを開始しました ==')
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
      recorder.autoRestart = true
      recorder.start();

      roomStatusSwitcher.join();
    } else {
      appendMessage('== 退室しました ===');
      recorder.autoRestart = false
      recorder.stop();

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

  const urlParams = new URLSearchParams(window.location.search);
  const roomKey = urlParams.get('room');
  if (roomKey != undefined) {
    roomId.value = roomKey;
  }
})();