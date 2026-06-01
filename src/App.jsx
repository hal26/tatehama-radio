import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';

const socket = io('https://tatehama-radio.onrender.com');

const languages = {
  ja: {
    title: "館浜電鉄 運行管理無線システム",
    statusLabel: "STATUS:",
    standby: "STANDBY (未接続)",
    online: "ONLINE (接続中)",
    freqLabel: "FREQ/LOC:",
    membersLabel: "MEMBERS:",
    signalLabel: "SIGNAL:",
    roleLabel: "ROLE:",
    userLabel: "NAME:",
    tx: "■ TX (送信中)",
    rx: "□ RX (受信待機)",
    btnConnect: "接続開始",
    btnDisconnect: "回線切断",
    pttReady: "● PTT長押しで送話",
    pttActive: "✦ 送話中 (PTT ON) ✦",
    settings: "設定",
    home: "🏠 ホームに戻る",
    langSelect: "言語選択 (Language)",
    themeSelect: "画面テーマ (Theme)",
    themeDark: "黒ベース (Dark)",
    themeLight: "白ベース (Light)",
    keybindLabel: "PTTキー設定",
    audioInputLabel: "マイク入力デバイス (🎤)",
    audioOutputLabel: "スピーカー出力デバイス (🔊)",
    loginTitle: "乗務員登録 ＆ 職種選択",
    namePlaceholder: "乗務員名を入力してください",
    driver: "運転士",
    signal: "信号係",
    dispatcher: "運転指令員",
    btnLogin: "乗務開始",
    driverPanelTitle: "運転台無線チャンネル設定",
    driverInputHelp: "無線ch入力 (1～80) または直接周波数入力",
    signalPanelTitle: "信号所・検車区 VC選択",
    dispPanelTitle: "無線通信・社員配置モニター盤"
  }
};

const signalStationsPage1 = ["館浜", "駒野", "津崎", "浜園", "新野崎", "江ノ原検車区"];
const signalStationsPage2 = ["大道寺", "藤江", "水越", "高見沢", "日野森", "西赤山", "赤山町"];

function App() {
  const [lang, setLang] = useState('ja');
  const [theme, setTheme] = useState('dark');
  const t = languages[lang];

  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userName, setUserName] = useState(() => localStorage.getItem('tatehama_crew_name') || '');
  const [selectedRole, setSelectedRole] = useState('driver');

  const [inputFreq, setInputFreq] = useState('1');
  const [currentDisplayLabel, setCurrentDisplayLabel] = useState('---');
  const [currentRawFreq, setCurrentRawFreq] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [isTalking, setIsTalking] = useState(false);
  const [connectedCount, setConnectedCount] = useState(0);

  const [signalPage, setSignalPage] = useState(1);
  
  // 👥 全員が見れるリアルタイム配置データ
  const [monitorData, setMonitorData] = useState([]);

  // ⚙️設定・デバイス管理
  const [showSettings, setShowSettings] = useState(false);
  const [pttKey, setPttKey] = useState('Space');
  const [isListeningKey, setIsListeningKey] = useState(false);
  const [audioInputs, setAudioInputs] = useState([]);
  const [audioOutputs, setAudioOutputs] = useState([]);
  const [selectedInput, setSelectedInput] = useState('');
  const [selectedOutput, setSelectedOutput] = useState('');

  // 📝 指令通告（メッセージ）機能用ステート
  const [dispatchTarget, setDispatchTarget] = useState('');
  const [dispatchMessage, setDispatchMessage] = useState('');
  const [receivedNotice, setReceivedNotice] = useState(null);
  const audioIntervalRef = useRef(null);

  // 🔊 運転士用：指令警告音（ピピピピ！）
  const startEmergencyBeep = () => {
    if (audioIntervalRef.current) return;
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    audioIntervalRef.current = setInterval(() => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(1200, audioCtx.currentTime);
      gain.gain.setValueAtTime(0.2, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.15);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.15);
    }, 300);
  };

  const stopEmergencyBeep = () => {
    if (audioIntervalRef.current) {
      clearInterval(audioIntervalRef.current);
      audioIntervalRef.current = null;
    }
  };

  // 🎤 デバイス一覧の自動取得
  useEffect(() => {
    navigator.mediaDevices.getUserMedia({ audio: true })
      .then(() => {
        navigator.mediaDevices.enumerateDevices().then(devices => {
          const inputs = devices.filter(d => d.kind === 'audioinput');
          const outputs = devices.filter(d => d.kind === 'audiooutput');
          setAudioInputs(inputs);
          setAudioOutputs(outputs);
          if (inputs.length > 0) setSelectedInput(inputs[0].deviceId);
          if (outputs.length > 0) setSelectedOutput(outputs[0].deviceId);
        });
      })
      .catch(err => console.error("デバイス取得失敗:", err));
  }, []);

  useEffect(() => {
    socket.on('room-count-update', (count) => setConnectedCount(count));
    
    // 全員へ送信される配置モニターデータを受け取る
    socket.on('global-crew-monitor-data', (data) => setMonitorData(data));

    socket.on('join-failed', (msg) => {
      alert(`⚠️ 接続エラー: ${msg}`);
      setIsConnected(false);
    });

    socket.on('join-success', ({ frequency, displayLabel }) => {
      setCurrentRawFreq(frequency);
      setCurrentDisplayLabel(displayLabel);
      setIsConnected(true);
    });

    // 指令通告の受信
    socket.on('receive-dispatcher-notice', (data) => {
      if (data.target === '全員' || data.target === userName || userName.includes(data.target)) {
        setReceivedNotice(data);
        startEmergencyBeep();
      }
    });

    return () => {
      socket.off('room-count-update');
      socket.off('global-crew-monitor-data');
      socket.off('join-failed');
      socket.off('join-success');
      socket.off('receive-dispatcher-notice');
    };
  }, [userName]);

  // PTTキーボード
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (isListeningKey) {
        e.preventDefault();
        setPttKey(e.code);
        setIsListeningKey(false);
        return;
      }
      if (isLoggedIn && isConnected && !showSettings) {
        if (e.code === (pttKey === 'Space' ? 'Space' : pttKey)) {
          e.preventDefault();
          setIsTalking(true);
        }
      }
    };
    const handleKeyUp = (e) => {
      if (isLoggedIn && isConnected && !showSettings) {
        if (e.code === (pttKey === 'Space' ? 'Space' : pttKey)) {
          e.preventDefault();
          setIsTalking(false);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [isLoggedIn, isConnected, pttKey, isListeningKey, showSettings]);

  const handleLoginSubmit = () => {
    if (!userName.trim()) {
      alert("乗務員名を入力してください。");
      return;
    }
    localStorage.setItem('tatehama_crew_name', userName);
    setIsLoggedIn(true);
    socket.emit('user-login', { name: userName, role: selectedRole });
  };

  const handleGoHome = () => {
    handleDisconnect();
    stopEmergencyBeep();
    setReceivedNotice(null);
    setIsLoggedIn(false);
  };

  // 運転士・指令：ch・周波数接続処理
  const handleDriverConnect = () => {
    let targetFreq = inputFreq.trim();
    let label = "";

    const chNum = parseInt(targetFreq, 10);
    if (!isNaN(chNum) && chNum >= 1 && chNum <= 80) {
      const calcOffset = 100 + chNum;
      targetFreq = `111.${calcOffset}`;
      label = `運転台無線 ${chNum}ch (${targetFreq} MHz)`;
    } else {
      label = `無線周波数 (${targetFreq} MHz)`;
    }

    socket.emit('join-frequency', { frequency: targetFreq, displayLabel: label });
  };

  // 📞 指令専用：ボタン一発で「指令専用本線VC」に接続する処理
  const handleDispatcherDedicatedConnect = () => {
    socket.emit('join-frequency', { 
      frequency: '111.000', 
      displayLabel: '指令専用無線 (111.000 MHz)' 
    });
  };

  const handleSignalConnect = (stationName) => {
    const freqCode = `sig_${stationName}`;
    const label = `信号VC: ${stationName}`;
    socket.emit('join-frequency', { frequency: freqCode, displayLabel: label });
  };

  const handleDisconnect = () => {
    socket.emit('leave-frequency');
    setIsConnected(false);
    setIsTalking(false);
    setConnectedCount(0);
    setCurrentDisplayLabel('---');
    setCurrentRawFreq('');
  };

  // 指令通告一斉送信
  const handleSendNotice = () => {
    if (!dispatchTarget.trim() || !dispatchMessage.trim()) {
      alert("対象と指令内容を入力してください。");
      return;
    }
    socket.emit('send-dispatcher-notice', {
      target: dispatchTarget.trim(),
      message: dispatchMessage.trim(),
      sender: userName
    });
    alert(`➔ [${dispatchTarget}] 宛に通告を送信しました。`);
    setDispatchMessage('');
  };

  const handleConfirmNotice = () => {
    stopEmergencyBeep();
    setReceivedNotice(null);
  };

  const getRoleText = (r) => {
    if (r === 'driver') return t.driver;
    if (r === 'signal') return t.signal;
    return t.dispatcher;
  };

  if (!isLoggedIn) {
    return (
      <div className={`app-container theme-${theme} login-screen-wrapper`}>
        <h2>{t.loginTitle}</h2>
        <input 
          type="text" 
          className="crew-name-input" 
          value={userName} 
          onChange={(e) => setUserName(e.target.value)} 
          placeholder={t.namePlaceholder}
        />
        <div className="role-grid">
          <button className={`role-select-card ${selectedRole === 'driver' ? 'active' : ''}`} onClick={() => setSelectedRole('driver')}>🚊<br/>{t.driver}</button>
          <button className={`role-select-card ${selectedRole === 'signal' ? 'active' : ''}`} onClick={() => setSelectedRole('signal')}>🚨<br/>{t.signal}</button>
          <button className={`role-select-card ${selectedRole === 'dispatcher' ? 'active' : ''}`} onClick={() => setSelectedRole('dispatcher')}>📞<br/>{t.dispatcher}</button>
        </div>
        <button className="btn-action-primary start-duty-btn" onClick={handleLoginSubmit}>{t.btnLogin}</button>
      </div>
    );
  }

  return (
    <div className={`app-container theme-${theme}`}>
      <header className="app-header">
        <h1>{t.title}</h1>
        <div className="header-controls">
          <button className="icon-btn home-btn" onClick={handleGoHome}>{t.home}</button>
          <button className="icon-btn" onClick={() => setShowSettings(!showSettings)}>⚙️ {t.settings}</button>
        </div>
      </header>

      {/* 緊急通告アラート */}
      {receivedNotice && (
        <div className="emergency-notice-overlay">
          <div className="emergency-notice-box">
            <div className="notice-blink-header">⚠️ 運転指令から緊急通告 ⚠️</div>
            <div className="notice-body">
              <p className="notice-meta">発信元: {receivedNotice.sender} 運転指令員</p>
              <div className="notice-text-content">{receivedNotice.message}</div>
            </div>
            <button className="btn-notice-confirm" onClick={handleConfirmNotice}>了解 (通告を確認しました)</button>
          </div>
        </div>
      )}

      {showSettings && (
        <div className="settings-overlay">
          <div className="settings-box">
            <h3>⚙️ {t.settings}</h3>
            <div className="settings-scroll-area">
              <label>{t.themeSelect}</label>
              <select value={theme} onChange={(e) => setTheme(e.target.value)} className="lang-select">
                <option value="dark">{t.themeDark}</option>
                <option value="light">{t.themeLight}</option>
              </select>
              <label>{t.keybindLabel}</label>
              <button className={`btn-keybind-capture ${isListeningKey ? 'capturing' : ''}`} onClick={() => setIsListeningKey(true)}>
                {isListeningKey ? "Press any key..." : pttKey}
              </button>
              <label>{t.audioInputLabel}</label>
              <select value={selectedInput} onChange={(e) => setSelectedInput(e.target.value)} className="lang-select">
                {audioInputs.map(d => <option key={d.deviceId} value={d.deviceId}>{d.label || `Mic ${d.deviceId.slice(0,5)}`}</option>)}
              </select>
              <label>{t.audioOutputLabel}</label>
              <select value={selectedOutput} onChange={(e) => setSelectedOutput(e.target.value)} className="lang-select">
                {audioOutputs.map(d => <option key={d.deviceId} value={d.deviceId}>{d.label || `Speaker ${d.deviceId.slice(0,5)}`}</option>)}
              </select>
            </div>
            <hr />
            <button className="btn-close" onClick={() => { setShowSettings(false); setIsListeningKey(false); }}>X</button>
          </div>
        </div>
      )}

      <div className="main-cockpit-grid">
        {/* 左モニター側 */}
        <div className="cockpit-left-monitor">
          <div className="radio-display-lcd">
            <div className="lcd-line"><span className="lcd-lbl">{t.statusLabel}</span><span className={`lcd-val ${isConnected ? 'on' : 'off'}`}>{isConnected ? t.online : t.standby}</span></div>
            <div className="lcd-line"><span className="lcd-lbl">{t.userLabel}</span><span className="lcd-val highlights">{userName}</span></div>
            <div className="lcd-line"><span className="lcd-lbl">{t.roleLabel}</span><span className="lcd-val" style={{color:'#00d2ff'}}>{getRoleText(selectedRole)}</span></div>
            <div className="lcd-line big-lcd-line"><span className="lcd-lbl">{t.freqLabel}</span><span className="lcd-val green-lcd-text">{currentDisplayLabel}</span></div>
            <div className="lcd-line"><span className="lcd-lbl">{t.membersLabel}</span><span className="lcd-val green-lcd-text">{isConnected ? `${connectedCount} / 5 名` : '---'}</span></div>
            <div className="lcd-line"><span className="lcd-lbl">{t.signalLabel}</span><span className="lcd-val">{isTalking ? t.tx : isConnected ? t.rx : '---'}</span></div>
          </div>

          {isConnected && (
            <div className="in-call-controls">
              <div className="ctrl-buttons-row">
                <button onClick={handleDisconnect} className="btn-cockpit danger">
                  {t.btnDisconnect}
                </button>
              </div>
              <button 
                className={`ptt-hardware-button ${isTalking ? 'active' : ''}`}
                onMouseDown={() => setIsTalking(true)} onMouseUp={() => setIsTalking(false)} onMouseLeave={() => setIsTalking(false)}
              >
                {isTalking ? t.pttActive : `${t.pttReady} [${pttKey}]`}
              </button>
            </div>
          )}
        </div>

        {/* 右操作パネル・モニター一覧側 */}
        <div className="cockpit-right-panel">
          {!isConnected ? (
            <div className="right-panel-scroll-box">
              {selectedRole === 'driver' && (
                <div className="sub-panel-card">
                  <h3>🚊 {t.driverPanelTitle}</h3>
                  <p className="help-text">{t.driverInputHelp}</p>
                  <input type="text" className="freq-digit-input" value={inputFreq} onChange={(e) => setInputFreq(e.target.value.replace(/[^0-9.]/g, ''))} placeholder="例: 15" />
                  <button className="btn-action-primary" onClick={handleDriverConnect}>{t.btnConnect}</button>
                </div>
              )}

              {selectedRole === 'signal' && (
                <div className="sub-panel-card">
                  <h3>🚨 {t.signalPanelTitle} (Page {signalPage}/2)</h3>
                  <div className="signal-buttons-grid">
                    {signalPage === 1 ? (
                      signalStationsPage1.map(st => <button key={st} className="btn-station-select" onClick={() => handleSignalConnect(st)}>🚉 {st}</button>)
                    ) : (
                      signalStationsPage2.map(st => <button key={st} className="btn-station-select" onClick={() => handleSignalConnect(st)}>🚉 {st}</button>)
                    )}
                  </div>
                  <div className="pager-nav-bar">
                    <button className="btn-pager" disabled={signalPage === 1} onClick={() => setSignalPage(1)}>◀ Page 1</button>
                    <button className="btn-pager" disabled={signalPage === 2} onClick={() => setSignalPage(2)}>Page 2 ▶</button>
                  </div>
                </div>
              )}

              {/* 📞 指令専用画面：指令無線接続 ＆ 通告テキスト送信卓 */}
              {selectedRole === 'dispatcher' && (
                <>
                  <div className="sub-panel-card">
                    <h3>📞 指令無線 統制接続</h3>
                    <p className="help-text">指令員はボタン一発で「指令専用本線無線」を開くか、任意の運転chを指定して緊急介入できます。</p>
                    <div style={{display:'flex', gap:'15px', marginBottom:'10px'}}>
                      <button className="btn-action-primary" style={{background:'#27ae60', boxShadow:'0 4px 0 #1e7e43'}} onClick={handleDispatcherDedicatedConnect}>
                        📻 指令専用無線ch (111.000MHz) へ接続
                      </button>
                    </div>
                    <div style={{borderTop:'1px solid #30363d', paddingTop:'10px'}}>
                      <input type="text" className="freq-digit-input" style={{fontSize:'20px', padding:'8px'}} value={inputFreq} onChange={(e) => setInputFreq(e.target.value)} placeholder="他chに割り込む場合はch番号を入力" />
                      <button className="btn-action-primary" onClick={handleDriverConnect}>指定chへ緊急介入</button>
                    </div>
                  </div>

                  <div className="sub-panel-card" style={{marginTop: '10px'}}>
                    <h3>📝 列車運行通告送信盤</h3>
                    <p className="help-text">特定の運転台、または「全員」に向けて着発変更通告テキストを一斉送信します。</p>
                    <div style={{marginBottom: '8px'}}>
                      <input 
                        type="text" 
                        style={{width: '100%', padding: '10px', background: '#010409', color: '#fff', border: '1px solid #30363d', borderRadius: '4px'}} 
                        value={dispatchTarget} 
                        onChange={(e) => setDispatchTarget(e.target.value)} 
                        placeholder="送信先 (例: 1021M、または 全員)"
                      />
                    </div>
                    <div>
                      <textarea 
                        style={{width: '100%', height: '50px', padding: '10px', background: '#010409', color: '#fff', border: '1px solid #30363d', borderRadius: '4px', resize: 'none', fontFamily:'monospace'}} 
                        value={dispatchMessage} 
                        onChange={(e) => setDispatchMessage(e.target.value)} 
                        placeholder="通告内容を入力..."
                      />
                    </div>
                    <button className="btn-action-primary" style={{marginTop: '8px', padding: '10px', background: '#da5b0b', boxShadow: '0 4px 0 #9e3f03'}} onClick={handleSendNotice}>
                      ⚡ 通告呼出・一斉送信 ⚡
                    </button>
                  </div>
                </>
              )}
            </div>
          ) : (
            <div className="sub-panel-card active-call-status">
              <p>🔊 現在、通信回線が開通しています。</p>
              <p>左側のPTTスイッチ、またはキーボードの [{pttKey}] を押しながら交信してください。</p>
            </div>
          )}

          {/* 🖥️ 全社員共通モニター盤（運転士・信号係・指令員全員の画面の最下部に表示） */}
          <div className="dispatcher-monitor-board">
            <h3>🖥️ {t.dispPanelTitle}</h3>
            <div className="monitor-table-container">
              <table className="monitor-table">
                <thead>
                  <tr>
                    <th>乗務員名</th>
                    <th>担当職種</th>
                    <th>現在位置 (接続中の周波数・駅VC)</th>
                  </tr>
                </thead>
                <tbody>
                  {monitorData.map((user) => (
                    <tr key={user.id}>
                      <td>{user.name}</td>
                      <td><span className={`badge role-${user.role}`}>{getRoleText(user.role)}</span></td>
                      <td className="loc-text">{user.location}</td>
                    </tr>
                  ))}
                  {monitorData.length === 0 && <tr><td colSpan="3" style={{textAlign:'center', color:'#666'}}>乗務中の社員はいません</td></tr>}
                </tbody>
              </table>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}

export default App;