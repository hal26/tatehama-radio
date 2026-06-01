import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';

// ⚠️ Renderの通信サーバーURL
const socket = io('https://tatehama-radio.onrender.com');

// 🚀 システムバージョン
const APP_VERSION = "v2.1.1";

const languages = {
  ja: {
    title: "館浜電鉄 運行管理無線システム",
    statusLabel: "STATUS:",
    standby: "STANDBY (未接続)",
    online: "ONLINE (複数無線接続中)",
    freqLabel: "MAIN CH/LOC:",
    subFreqLabel: "SUB CH (受令):",
    membersLabel: "MEMBERS:",
    signalLabel: "SIGNAL:",
    roleLabel: "ROLE:",
    userLabel: "NAME:",
    tx: "■ TX (メイン送信中)",
    rx: "□ RX (全線待機中)",
    btnConnect: "複数無線 接続開始",
    btnDisconnect: "全回線切断",
    pttReady: "● PTT長押しでメイン送話",
    pttActive: "✦ メイン送話中 (PTT ON) ✦",
    settings: "設定",
    home: "🏠 職種選択に戻る",
    langSelect: "言語選択 (Language)",
    themeSelect: "画面テーマ (Theme)",
    themeDark: "黒ベース (Dark)",
    themeLight: "白ベース (Light)",
    keybindLabel: "PTTキー設定",
    audioInputLabel: "マイク入力デバイス (🎤)",
    audioOutputLabel: "スピーカー出力デバイス (🔊)",
    loginTitle: "乗務員登録 ＆ 職種認証ログイン",
    namePlaceholder: "乗務員名を入力してください",
    codePlaceholder: "特務認証コード入力 (8桁)",
    driver: "運転士",
    signal: "信号係",
    dispatcher: "運転指令員",
    btnLogin: "乗務開始",
    driverPanelTitle: "運転台無線 ＆ 列車無線 同時設定",
    driverInputHelp: "指定ch(1～80)に接続し、同時に【列車無線】も傍受します",
    signalPanelTitle: "信号所VC ＆ 列車無線 同時選択",
    dispPanelTitle: "無線通信・社員配置モニター盤",
    btnClearAuth: "⚠️ 全設定クリア（ログアウト）"
  }
};

const signalStationsPage1 = ["館浜", "駒野", "津崎", "浜園", "新野崎", "江ノ原検車区"];
const signalStationsPage2 = ["大道寺", "藤江", "水越", "高見沢", "日野森", "西赤山", "赤山町"];

function App() {
  const [lang, setLang] = useState('ja');
  const [theme, setTheme] = useState(() => localStorage.getItem('tatehama_theme') || 'dark');
  const t = languages[lang];

  // ログイン・認証管理
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userName, setUserName] = useState(() => localStorage.getItem('tatehama_crew_name') || '');
  const [authCode, setAuthCode] = useState(() => localStorage.getItem('tatehama_auth_code') || ''); 
  const [selectedRole, setSelectedRole] = useState('driver'); 
  const [isAdminUnlocked, setIsAdminUnlocked] = useState(false); 

  // 無線機内部データ
  const [inputFreq, setInputFreq] = useState('1');
  const [currentDisplayLabel, setCurrentDisplayLabel] = useState('---');
  const [subDisplayLabel, setSubDisplayLabel] = useState('---'); 
  const [isConnected, setIsConnected] = useState(false);
  const [isTalking, setIsTalking] = useState(false);
  const [connectedCount, setConnectedCount] = useState(0);

  const [signalPage, setSignalPage] = useState(1);
  const [monitorData, setMonitorData] = useState([]);

  // 設定・デバイス
  const [showSettings, setShowSettings] = useState(false);
  const [pttKey, setPttKey] = useState('Space');
  const [isListeningKey, setIsListeningKey] = useState(false);
  const [audioInputs, setAudioInputs] = useState([]);
  const [audioOutputs, setAudioOutputs] = useState([]);
  const [selectedInput, setSelectedInput] = useState('');
  const [selectedOutput, setSelectedOutput] = useState('');

  // 指令通告メッセージ
  const [dispatchTarget, setDispatchTarget] = useState('');
  const [dispatchMessage, setDispatchMessage] = useState('');
  const [receivedNotice, setReceivedNotice] = useState(null);
  const audioIntervalRef = useRef(null);

  useEffect(() => {
    localStorage.setItem('tatehama_theme', theme);
  }, [theme]);

  // 警告音
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

  // デバイス取得
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
    socket.on('global-crew-monitor-data', (data) => setMonitorData(data));

    socket.on('join-failed', (msg) => {
      alert(`⚠️ 接続エラー: ${msg}`);
      setIsConnected(false);
    });

    socket.on('join-success', ({ frequency, displayLabel }) => {
      setIsConnected(true);
    });

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

  // 🔑 認証＆ログイン
  const handleLoginSubmit = () => {
    if (!userName.trim()) {
      alert("乗務員名を入力してください。");
      return;
    }
    const trimmedCode = authCode.trim();

    if (trimmedCode === '88888888') {
      setIsAdminUnlocked(true);
      alert("🔓 管理者認証成功：全職種選択ボタンが解放されました。");
      setAuthCode(''); 
      return; 
    }

    if (isAdminUnlocked) {
      localStorage.setItem('tatehama_crew_name', userName);
      setIsLoggedIn(true);
      socket.emit('user-login', { name: userName, role: selectedRole });
      return;
    }

    let finalRole = 'driver'; 
    if (trimmedCode === '22223333') {
      finalRole = 'signal';
      alert("🚨 信号係として認証されました。");
      localStorage.setItem('tatehama_auth_code', trimmedCode); 
    } else if (trimmedCode === '44445555') {
      finalRole = 'dispatcher';
      alert("📞 運転指令員として認証されました。");
      localStorage.setItem('tatehama_auth_code', trimmedCode); 
    } else if (trimmedCode !== '') {
      alert("❌ 認証コードが正しくありません。");
      return;
    } else {
      localStorage.removeItem('tatehama_auth_code');
    }

    localStorage.setItem('tatehama_crew_name', userName);
    setSelectedRole(finalRole);
    setIsLoggedIn(true);
    socket.emit('user-login', { name: userName, role: finalRole });
  };

  const handleClearAllStorage = () => {
    if (window.confirm("保存されている名前、認証コード、テーマ設定をすべて削除してログアウトしますか？")) {
      handleDisconnect();
      stopEmergencyBeep();
      setReceivedNotice(null);
      localStorage.clear(); 
      setUserName('');
      setAuthCode('');
      setTheme('dark');
      setSelectedRole('driver');
      setIsAdminUnlocked(false);
      setIsLoggedIn(false);
      alert("すべての記憶データを消去しました。");
    }
  };

  const handleGoHome = () => {
    handleDisconnect();
    stopEmergencyBeep();
    setReceivedNotice(null);
    setIsLoggedIn(false);
    setIsAdminUnlocked(false); 
    setAuthCode(localStorage.getItem('tatehama_auth_code') || '');
    setSelectedRole('driver');
  };

  const handleDriverConnect = () => {
    let targetFreq = inputFreq.trim();
    let mainLabel = "";
    const chNum = parseInt(targetFreq, 10);
    
    if (!isNaN(chNum) && chNum >= 1 && chNum <= 80) {
      const calcOffset = 100 + chNum;
      targetFreq = `111.${calcOffset}`;
      mainLabel = `${chNum}ch 運転台無線 (${targetFreq} MHz)`;
    } else {
      mainLabel = `カスタム周波数 (${targetFreq} MHz)`;
    }

    socket.emit('join-frequency', { 
      frequency: targetFreq, 
      displayLabel: `${mainLabel} + 📻列車無線(111.000)` 
    });

    setCurrentDisplayLabel(mainLabel);
    setSubDisplayLabel("111.000 MHz (全線列車無線共通ch)");
    setIsConnected(true);
  };

  const handleDispatcherDedicatedConnect = () => {
    socket.emit('join-frequency', { 
      frequency: '111.000', 
      displayLabel: '全線列車無線 (111.000 MHz)' 
    });
    setCurrentDisplayLabel('全線列車無線 (111.000 MHz)');
    setSubDisplayLabel('なし (統制指令モード)');
    setIsConnected(true);
  };

  const handleSignalConnect = (stationName) => {
    const freqCode = `sig_${stationName}`;
    const mainLabel = `信号所内連絡VC [${stationName}駅]`;

    socket.emit('join-frequency', { 
      frequency: freqCode, 
      displayLabel: `信号:${stationName} + 📻列車無線(111.000)` 
    });

    setCurrentDisplayLabel(mainLabel);
    setSubDisplayLabel("111.000 MHz (全線列車無線共通ch)");
    setIsConnected(true);
  };

  const handleDisconnect = () => {
    socket.emit('leave-frequency');
    setIsConnected(false);
    setIsTalking(false);
    setConnectedCount(0);
    setCurrentDisplayLabel('---');
    setSubDisplayLabel('---');
  };

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
      <div className={`app-container theme-${theme} login-screen-page-wrapper`}>
        <div style={{position: 'absolute', top: '20px', right: '30px', zIndex: 10}}>
          <button className="icon-btn" onClick={() => setShowSettings(!showSettings)}>⚙️ {t.settings}</button>
        </div>

        {showSettings && (
          <div className="settings-overlay">
            <div className="settings-box">
              <h3>⚙️ {t.settings}</h3>
              <label>{t.themeSelect}</label>
              <select value={theme} onChange={(e) => setTheme(e.target.value)} className="lang-select">
                <option value="dark">{t.themeDark}</option>
                <option value="light">{t.themeLight}</option>
              </select>
              <hr />
              <button className="btn-close" onClick={() => setShowSettings(false)}>X</button>
            </div>
          </div>
        )}

        <div className="login-card-panel">
          <h2>{t.loginTitle}</h2>
          
          <div className="login-field-row">
            <label className="field-lbl">👤 乗務員名（保存されます）</label>
            <input 
              type="text" 
              className="crew-name-input-wide" 
              value={userName} 
              onChange={(e) => setUserName(e.target.value)} 
              placeholder={t.namePlaceholder}
            />
          </div>

          <div className="login-grid-two-column">
            <div className="login-left-box">
              <label className="field-lbl">🚊 担当職種選択</label>
              {!isAdminUnlocked ? (
                <button className="role-select-card-wide active">
                  🚊 {t.driver} (常時解放ルート)
                </button>
              ) : (
                <div className="admin-unlocked-menu-list">
                  <div className="admin-badge-txt">🔓 ADMIN FULL ACCESS ACTIVE</div>
                  <button className={`role-select-card-wide ${selectedRole === 'driver' ? 'active' : ''}`} onClick={() => setSelectedRole('driver')}>🚊 {t.driver}</button>
                  <button className={`role-select-card-wide ${selectedRole === 'signal' ? 'active' : ''}`} onClick={() => setSelectedRole('signal')}>🚨 {t.signal}</button>
                  <button className={`role-select-card-wide ${selectedRole === 'dispatcher' ? 'active' : ''}`} onClick={() => setSelectedRole('dispatcher')}>📞 {t.dispatcher}</button>
                </div>
              )}
            </div>

            <div className="login-right-box">
              <label className="field-lbl">🔒 特務認証コード（保存されます）</label>
              <input 
                type="password" 
                className="crew-code-input-wide" 
                value={authCode} 
                disabled={isAdminUnlocked} 
                onChange={(e) => setAuthCode(e.target.value.replace(/[^0-9]/g, ''))} 
                placeholder={isAdminUnlocked ? "認証パス完了" : t.codePlaceholder}
                maxLength={8}
              />
              <p className="code-sub-notice">※運転士は空欄でOK。信号・指令・アドミンのコードを入れると自動で記憶されます。</p>
            </div>
          </div>

          <button className="btn-action-primary start-duty-btn-wide" onClick={handleLoginSubmit}>
            {isAdminUnlocked ? "選択した職種で乗務開始 (ADMIN)" : t.btnLogin}
          </button>
        </div>

        <div className="login-footer-info-bar">
          <span>SYSTEM VERSION: {APP_VERSION}</span>
          <button className="btn-logout-clear" onClick={handleClearAllStorage}>{t.btnClearAuth}</button>
        </div>
      </div>
    );
  }

  return (
    <div className={`app-container theme-${theme}`}>
      <header className="app-header">
        <h1>{t.title} <span className="version-badge-tag">{APP_VERSION}</span></h1>
        <div className="header-controls">
          <button className="icon-btn home-btn" onClick={handleGoHome}>{t.home}</button>
          <button className="icon-btn" onClick={() => setShowSettings(!showSettings)}>⚙️ {t.settings}</button>
        </div>
      </header>

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
        <div className="cockpit-left-monitor">
          <div className="radio-display-lcd">
            <div className="lcd-line"><span className="lcd-lbl">{t.statusLabel}</span><span className={`lcd-val val-status ${isConnected ? 'on' : 'off'}`}>{isConnected ? t.online : t.standby}</span></div>
            <div className="lcd-line"><span className="lcd-lbl">{t.userLabel}</span><span className="lcd-val val-name">{userName}</span></div>
            <div className="lcd-line"><span className="lcd-lbl">{t.roleLabel}</span><span className="lcd-val val-role">{getRoleText(selectedRole)}</span></div>
            
            <div className="lcd-line" style={{borderBottom:'none', paddingBottom:'0'}}><span className="lcd-lbl">{t.freqLabel}</span></div>
            <div className="lcd-line" style={{paddingTop:'0', paddingBottom:'10px'}}><span className="lcd-val val-mainch">{currentDisplayLabel}</span></div>
            
            <div className="lcd-line line-sub-dashed"><span className="lcd-lbl lbl-sub-orange">{t.subFreqLabel}</span></div>
            <div className="lcd-line" style={{paddingTop:'0'}}><span className="lcd-val val-subch">{subDisplayLabel}</span></div>

            <div className="lcd-line line-members-top"><span className="lcd-lbl">{t.membersLabel}</span><span className="lcd-val val-members">{isConnected ? `${connectedCount} / 5 名` : '---'}</span></div>
            <div className="lcd-line"><span className="lcd-lbl">{t.signalLabel}</span><span className="lcd-val val-signal">{isTalking ? t.tx : isConnected ? t.rx : '---'}</span></div>
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
              <p>🔊 現在、複数無線が同時開通しています。</p>
              <p style={{color: '#ff9800'}}>👉 【メインCH】と【列車無線】の両方の音声を受信（傍受）しています。</p>
              <p>左側のPTTスイッチを押すと、ご自身の【メインCH】へ向けて発言できます。</p>
            </div>
          )}

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

      <div style={{position: 'absolute', bottom: '8px', right: '15px', zIndex: 5}}>
        <button className="btn-logout-clear-mini" onClick={handleClearAllStorage}>{t.btnClearAuth}</button>
      </div>
    </div>
  );
}

export default App;