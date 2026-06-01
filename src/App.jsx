import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';

const socket = io('https://tatehama-radio.onrender.com');

// 🚀 ポップアップを完全撤廃！赤文字インラインエラー表示アップデート
const APP_VERSION = "v3.1.2";

const languages = {
  ja: {
    title: "館浜電鉄 運行管理無線システム",
    statusLabel: "STATUS:",
    standby: "STANDBY (未接続)",
    online: "ONLINE (3ch同時受令中)",
    membersLabel: "MEMBERS:",
    signalLabel: "SIGNAL:",
    roleLabel: "ROLE:",
    userLabel: "NAME:",
    tx: "■ TX (送信中)",
    rx: "□ RX (全線待機中)",
    btnConnect: "マルチ無線 接続開始",
    btnDisconnect: "全回線切断",
    settings: "設定",
    home: "🏠 職種選択に戻る",
    langSelect: "言語選択 (Language)",
    themeSelect: "画面テーマ (Theme)",
    themeDark: "黒ベース (Dark)",
    themeLight: "白ベース (Light)",
    audioInputLabel: "マイク入力デバイス (🎤)",
    audioOutputLabel: "スピーカー出力デバイス (🔊)",
    loginTitle: "乗務員登録 ＆ 職種認証ログイン",
    namePlaceholder: "乗務員名を入力してください",
    codePlaceholder: "特務認証コード入力 (8桁)",
    driver: "運転士",
    signal: "信号係",
    dispatcher: "運転指令員",
    btnLogin: "乗務開始",
    driverPanelTitle: "運転台無線 3ch同時受令設定",
    driverInputHelp: "指定chに接続し、同時に【列車無線】【信号指令連絡波】も自動受令します",
    signalPanelTitle: "信号所VC 3ch同時受令選択",
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

  // 🚨 エラーメッセージ表示用の状態（ポップアップの代わり）
  const [nameError, setNameError] = useState('');
  const [codeError, setCodeError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  // 無線機内部データ
  const [inputFreq, setInputFreq] = useState('1');
  const [ch1Label, setCh1Label] = useState('---');
  const [ch2Label, setCh2Label] = useState('---');
  const [ch3Label, setCh3Label] = useState('---');
  const [isConnected, setIsConnected] = useState(false);
  const [connectedCount, setConnectedCount] = useState(0);

  const [signalPage, setSignalPage] = useState(1);
  const [monitorData, setMonitorData] = useState([]);

  // 🔊 3ch独立受話ミュート
  const [muteCh1, setMuteCh1] = useState(false);
  const [muteCh2, setMuteCh2] = useState(false);
  const [muteCh3, setMuteCh3] = useState(false);

  // 🎤 3ch独立PTT送信
  const [isTalkingCh1, setIsTalkingCh1] = useState(false);
  const [isTalkingCh2, setIsTalkingCh2] = useState(false);
  const [isTalkingCh3, setIsTalkingCh3] = useState(false);

  // ⌨️ PTTキー設定
  const [pttKeyCh1, setPttKeyCh1] = useState('Space');
  const [pttKeyCh2, setPttKeyCh2] = useState('KeyV');
  const [pttKeyCh3, setPttKeyCh3] = useState('KeyB');
  
  const [activeCaptureCh, setActiveCaptureCh] = useState(null); 
  const [showSettings, setShowSettings] = useState(false);
  const [audioInputs, setAudioInputs] = useState([]);
  const [audioOutputs, setAudioOutputs] = useState([]);
  const [selectedInput, setSelectedInput] = useState('');
  const [selectedOutput, setSelectedOutput] = useState('');

  // 📝 タイピング判定
  const [isTyping, setIsTyping] = useState(false);

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
      // 接続エラーも画面内通知に置き換え
      setCodeError(`⚠️ 接続エラー: ${msg}`);
      setIsConnected(false);
    });

    socket.on('join-success', () => {
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

  // ⌨️ キーボードイベント
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (activeCaptureCh !== null) {
        e.preventDefault();
        if (activeCaptureCh === 1) setPttKeyCh1(e.code);
        if (activeCaptureCh === 2) setPttKeyCh2(e.code);
        if (activeCaptureCh === 3) setPttKeyCh3(e.code);
        setActiveCaptureCh(null);
        return;
      }

      if (isTyping) return;

      if (e.code === 'Space') {
        e.preventDefault(); 
      }

      if (isLoggedIn && isConnected && !showSettings) {
        if (e.code === pttKeyCh1) { e.preventDefault(); setIsTalkingCh1(true); }
        if (e.code === pttKeyCh2) { e.preventDefault(); setIsTalkingCh2(true); }
        if (e.code === pttKeyCh3) { e.preventDefault(); setIsTalkingCh3(true); }
      }
    };

    const handleKeyUp = (e) => {
      if (isTyping) return;

      if (isLoggedIn && isConnected && !showSettings) {
        if (e.code === pttKeyCh1) { e.preventDefault(); setIsTalkingCh1(false); }
        if (e.code === pttKeyCh2) { e.preventDefault(); setIsTalkingCh2(false); }
        if (e.code === pttKeyCh3) { e.preventDefault(); setIsTalkingCh3(false); }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [isLoggedIn, isConnected, pttKeyCh1, pttKeyCh2, pttKeyCh3, activeCaptureCh, showSettings, isTyping]);

  // 🔑 認証ログイン（ポップアップを完全に使わない安全ロジック）
  const handleLoginSubmit = () => {
    // エラー表示のリセット
    setNameError('');
    setCodeError('');
    setSuccessMessage('');

    if (!userName.trim()) {
      setNameError("※ 乗務員名を入力してください。");
      return;
    }
    const trimmedCode = authCode.trim();

    if (trimmedCode === '88888888') {
      setIsAdminUnlocked(true);
      setSuccessMessage("🔓 管理者認証成功：全職種が選択可能になりました。");
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
      localStorage.setItem('tatehama_auth_code', trimmedCode); 
    } else if (trimmedCode === '44445555') {
      finalRole = 'dispatcher';
      localStorage.setItem('tatehama_auth_code', trimmedCode); 
    } else if (trimmedCode !== '') {
      // 🎯 ここです！ポップアップの代わりに赤文字を即座に出し、ロックは一切かけない
      setCodeError("❌ 認証コードが正しくありません。");
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
    handleDisconnect();
    stopEmergencyBeep();
    setReceivedNotice(null);
    localStorage.clear(); 
    setUserName('');
    setAuthCode('');
    setIsAdminUnlocked(false);
    setSelectedRole('driver');
    setIsLoggedIn(false);
    setTheme('dark');
    setIsTyping(false);
    setNameError('');
    setCodeError('');
    setSuccessMessage('');
  };

  const handleGoHome = () => {
    handleDisconnect();
    stopEmergencyBeep();
    setReceivedNotice(null);
    setIsAdminUnlocked(false); 
    setIsLoggedIn(false);
    setIsTyping(false);
    setNameError('');
    setCodeError('');
    setSuccessMessage('');
    setUserName(localStorage.getItem('tatehama_crew_name') || '');
    setAuthCode(localStorage.getItem('tatehama_auth_code') || '');
    setSelectedRole('driver');
  };

  // 🚊 運転士接続
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
      displayLabel: `${mainLabel} + 📻列車 + 📻連絡` 
    });

    setCh1Label(mainLabel);
    setCh2Label("111.000 MHz (全線列車無線共通波)");
    setCh3Label("111.900 MHz (全線共通 信号指令連絡波)");
    setIsConnected(true);
  };

  // 📞 指令員接続
  const handleDispatcherDedicatedConnect = () => {
    socket.emit('join-frequency', { 
      frequency: '111.000', 
      displayLabel: '全線列車無線統合管理' 
    });
    setCh1Label('111.000 MHz (全線列車無線共通波)');
    setCh2Label('111.900 MHz (全線共通 信号指令連絡波)');
    setCh3Label('なし (統制指令モード)');
    setIsConnected(true);
  };

  // 🚨 信号係接続
  const handleSignalConnect = (stationName) => {
    const freqCode = `sig_${stationName}`;
    const mainLabel = `信号所内連絡VC [${stationName}駅]`;

    socket.emit('join-frequency', { 
      frequency: freqCode, 
      displayLabel: `信号:${stationName} + 📻列車 + 📻連絡` 
    });

    setCh1Label(mainLabel);
    setCh2Label("111.000 MHz (全線列車無線共通波)");
    setCh3Label("111.900 MHz (全線共通 信号指令連絡波)");
    setIsConnected(true);
  };

  const handleDisconnect = () => {
    socket.emit('leave-frequency');
    setIsConnected(false);
    setIsTalkingCh1(false);
    setIsTalkingCh2(false);
    setIsTalkingCh3(false);
    setConnectedCount(0);
    setCh1Label('---');
    setCh2Label('---');
    setCh3Label('---');
  };

  const handleSendNotice = () => {
    // 指令室の通告エラーもポップアップからインライン赤文字（画面右側にうまく出す等）にするための安全チェック
    if (!dispatchTarget.trim() || !dispatchMessage.trim()) {
      alert("対象と指令内容を入力してください。");
      return;
    }
    socket.emit('send-dispatcher-notice', {
      target: dispatchTarget.trim(),
      message: dispatchMessage.trim(),
      sender: userName
    });
    setDispatchMessage('');
  };

  const handleKeypadPress = (num) => {
    if (num === '修正') {
      setInputFreq('');
    } else {
      if (inputFreq.length < 4) {
        setInputFreq(inputFreq + num);
      }
    }
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
          
          {/* 全体向けサクセスメッセージ表示エリア */}
          {successMessage && <div className="login-inline-success-box">{successMessage}</div>}

          <div className="login-field-row">
            <div style={{display: 'flex', justifyContent: 'between', alignItems: 'center', width: '100%'}}>
              <label className="field-lbl" style={{margin: 0}}>👤 乗務員名（保存されます）</label>
              {nameError && <span className="inline-red-error-text" style={{color: '#ff9800', marginLeft: 'auto', fontWeight: 'bold'}}>{nameError}</span>}
            </div>
            <input 
              type="text" 
              className="crew-name-input-wide" 
              value={userName} 
              onFocus={() => setIsTyping(true)}
              onBlur={() => setIsTyping(false)}
              onChange={(e) => { setUserName(e.target.value); setNameError(''); }} 
              placeholder={t.namePlaceholder}
            />
          </div>

          <div className="login-grid-two-column">
            <div className="login-left-box">
              <label className="field-lbl">🚊 担当職種選択</label>
              {!isAdminUnlocked ? (
                <button className="role-select-card-wide active" type="button">
                  🚊 {t.driver} (常時解放ルート)
                </button>
              ) : (
                <div className="admin-unlocked-menu-list">
                  <div className="admin-badge-txt">🔓 ADMIN FULL ACCESS ACTIVE</div>
                  <button className={`role-select-card-wide ${selectedRole === 'driver' ? 'active' : ''}`} type="button" onClick={() => setSelectedRole('driver')}>🚊 {t.driver}</button>
                  <button className={`role-select-card-wide ${selectedRole === 'signal' ? 'active' : ''}`} type="button" onClick={() => setSelectedRole('signal')}>🚨 {t.signal}</button>
                  <button className={`role-select-card-wide ${selectedRole === 'dispatcher' ? 'active' : ''}`} type="button" onClick={() => setSelectedRole('dispatcher')}>📞 {t.dispatcher}</button>
                </div>
              )}
            </div>

            <div className="login-right-box">
              <div style={{display: 'flex', justifyContent: 'between', alignItems: 'center', width: '100%'}}>
                <label className="field-lbl" style={{margin: 0}}>🔒 特務認証コード（保存されます）</label>
              </div>
              <input 
                type="password" 
                className="crew-code-input-wide" 
                style={{borderColor: codeError ? '#f85149' : ''}}
                value={authCode} 
                disabled={isAdminUnlocked} 
                onFocus={() => setIsTyping(true)}
                onBlur={() => setIsTyping(false)}
                onChange={(e) => { setAuthCode(e.target.value.replace(/[^0-9]/g, '')); setCodeError(''); }} 
                placeholder={isAdminUnlocked ? "認証パス完了" : t.codePlaceholder}
                maxLength={8}
              />
              {/* 🎯 パスワードが違うとき、入力欄のすぐ下に鮮烈な赤文字で表示！ */}
              {codeError ? (
                <div className="inline-red-error-text" style={{marginTop: '6px', color: '#f85149', fontWeight: 'bold', fontSize: '13px'}}>{codeError}</div>
              ) : (
                <p className="code-sub-notice">※運転士は空欄でOK。信号・指令・アドミンのコードを入れると自動で記憶されます。</p>
              )}
            </div>
          </div>

          <button className="btn-action-primary start-duty-btn-wide" type="button" onClick={handleLoginSubmit}>
            {isAdminUnlocked ? "選択した職種で乗務開始 (ADMIN)" : t.btnLogin}
          </button>
        </div>

        <div className="login-footer-info-bar">
          <span>SYSTEM VERSION: {APP_VERSION}</span>
          <button className="btn-logout-clear" type="button" onClick={handleClearAllStorage}>{t.btnClearAuth}</button>
        </div>
      </div>
    );
  }

  return (
    <div className={`app-container theme-${theme}`}>
      <header className="app-header">
        <h1>{t.title} <span className="version-badge-tag">{APP_VERSION}</span></h1>
        <div className="header-controls">
          <button className="icon-btn home-btn" type="button" onClick={handleGoHome}>{t.home}</button>
          <button className="icon-btn" type="button" onClick={() => setShowSettings(!showSettings)}>⚙️ {t.settings}</button>
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
          <div className="settings-box" style={{width: '450px'}}>
            <h3>⚙️ {t.settings}</h3>
            <div className="settings-scroll-area">
              <label>{t.themeSelect}</label>
              <select value={theme} onChange={(e) => setTheme(e.target.value)} className="lang-select">
                <option value="dark">{t.themeDark}</option>
                <option value="light">{t.themeLight}</option>
              </select>
              
              <div style={{border: '1px solid #30363d', padding: '12px', borderRadius: '6px', marginTop: '12px', background: 'rgba(0,0,0,0.2)'}}>
                <span style={{fontSize: '13px', fontWeight: 'bold', color: '#f9826c'}}>⌨️ 独立PTT送信キー割り当て</span>
                
                <label style={{marginTop: '8px'}}>無線① PTTキー (メイン/駅VC)</label>
                <button type="button" className={`btn-keybind-capture ${activeCaptureCh === 1 ? 'capturing' : ''}`} onClick={() => setActiveCaptureCh(1)}>
                  {activeCaptureCh === 1 ? "任意のキーを押してください..." : pttKeyCh1}
                </button>

                <label style={{marginTop: '8px'}}>無線② PTTキー (全線列車無線)</label>
                <button type="button" className={`btn-keybind-capture ${activeCaptureCh === 2 ? 'capturing' : ''}`} onClick={() => setActiveCaptureCh(2)}>
                  {activeCaptureCh === 2 ? "任意のキーを押してください..." : pttKeyCh2}
                </button>

                <label style={{marginTop: '8px'}}>無線③ PTTキー (信号指令連絡波)</label>
                <button type="button" className={`btn-keybind-capture ${activeCaptureCh === 3 ? 'capturing' : ''}`} onClick={() => setActiveCaptureCh(3)}>
                  {activeCaptureCh === 3 ? "任意のキーを押してください..." : pttKeyCh3}
                </button>
              </div>

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
            <button className="btn-close" type="button" onClick={() => { setShowSettings(false); setActiveCaptureCh(null); }}>X</button>
          </div>
        </div>
      )}

      <div className="main-cockpit-grid">
        <div className="cockpit-left-monitor">
          <div className="radio-display-lcd" style={{gap: '8px', padding: '15px'}}>
            <div className="lcd-line"><span className="lcd-lbl">{t.statusLabel}</span><span className={`lcd-val ${isConnected ? 'on' : 'off'}`}>{isConnected ? t.online : t.standby}</span></div>
            <div className="lcd-line"><span className="lcd-lbl">{t.userLabel}</span><span className={`lcd-val highlights`}>{userName}</span></div>
            <div className="lcd-line"><span className="lcd-lbl">{t.roleLabel}</span><span className="lcd-val role-name-color-lcd">{getRoleText(selectedRole)}</span></div>
            
            <div>
              <div className="lcd-line" style={{border: 'none'}}><span className="lcd-lbl">📡 無線① [MAIN CH]:</span></div>
              <div className="lcd-line" style={{border: 'none', alignItems: 'center'}}>
                <span className="lcd-val val-mainch" style={{fontSize: '16px', color: muteCh1 ? '#768390' : '#39d353'}}>{muteCh1 ? "--- (MUTE中)" : ch1Label}</span>
                <button type="button" onClick={() => setMuteCh1(!muteCh1)} style={{padding: '3px 8px', fontSize: '11px', fontWeight: 'bold', background: muteCh1 ? '#c0392b' : '#27ae60', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer'}}>
                  {muteCh1 ? "🔇 MUTE" : "🔊 ON"}
                </button>
              </div>
              <div className="lcd-line" style={{fontSize: '11px', color: '#8b949e'}}>PTTキー: [{pttKeyCh1}] {isTalkingCh1 && <span style={{color: '#ff9800', fontWeight: 'bold'}}>【TX中】</span>}</div>
            </div>

            <div style={{borderTop: '1px dashed #30363d', paddingTop: '5px'}}>
              <div className="lcd-line" style={{border: 'none'}}><span className="lcd-lbl" style={{color: '#ff9800'}}>📻 無線② [列車無線波]:</span></div>
              <div className="lcd-line" style={{border: 'none', alignItems: 'center'}}>
                <span className="lcd-val" style={{fontSize: '14px', color: muteCh2 ? '#768390' : '#ffb74d'}}>{muteCh2 ? "--- (MUTE中)" : ch2Label}</span>
                <button type="button" onClick={() => setMuteCh2(!muteCh2)} style={{padding: '3px 8px', fontSize: '11px', fontWeight: 'bold', background: muteCh2 ? '#c0392b' : '#27ae60', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer'}}>
                  {muteCh2 ? "🔇 MUTE" : "🔊 ON"}
                </button>
              </div>
              <div className="lcd-line" style={{fontSize: '11px', color: '#8b949e'}}>PTTキー: [{pttKeyCh2}] {isTalkingCh2 && <span style={{color: '#ff9800', fontWeight: 'bold'}}>【TX中】</span>}</div>
            </div>

            <div style={{borderTop: '1px dashed #30363d', paddingTop: '5px'}}>
              <div className="lcd-line" style={{border: 'none'}}><span className="lcd-lbl" style={{color: '#00d2ff'}}>📡 無線③ [信号指令連絡波]:</span></div>
              <div className="lcd-line" style={{border: 'none', alignItems: 'center'}}>
                <span className="lcd-val" style={{fontSize: '14px', color: muteCh3 ? '#768390' : '#88d8ff'}}>{muteCh3 ? "--- (MUTE中)" : ch3Label}</span>
                <button type="button" onClick={() => setMuteCh3(!muteCh3)} style={{padding: '3px 8px', fontSize: '11px', fontWeight: 'bold', background: muteCh3 ? '#c0392b' : '#27ae60', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer'}}>
                  {muteCh3 ? "🔇 MUTE" : "🔊 ON"}
                </button>
              </div>
              <div className="lcd-line" style={{fontSize: '11px', color: '#8b949e'}}>PTTキー: [{pttKeyCh3}] {isTalkingCh3 && <span style={{color: '#ff9800', fontWeight: 'bold'}}>【TX中】</span>}</div>
            </div>

            <div className="lcd-line" style={{borderTop: '2px solid #30363d', paddingTop: '5px'}}><span className="lcd-lbl">{t.membersLabel}</span><span className="lcd-val green-lcd-text" style={{fontSize: '16px'}}>{isConnected ? `${connectedCount} / 5 名` : '---'}</span></div>
          </div>

          {isConnected && (
            <div className="in-call-controls">
              <button onClick={handleDisconnect} className="btn-cockpit danger" type="button">
                {t.btnDisconnect}
              </button>
              
              <div style={{display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '5px'}}>
                <button className={`ptt-hardware-button ${isTalkingCh1 ? 'active' : ''}`} style={{height: '45px', fontSize: '14px', boxShadow: '0 3px 0 #9e3f03'}} type="button" onMouseDown={() => setIsTalkingCh1(true)} onMouseUp={() => setIsTalkingCh1(false)} onMouseLeave={() => setIsTalkingCh1(false)}>
                  {isTalkingCh1 ? "✦ 無線① 送話中 ✦" : `① メイン送信 [${pttKeyCh1}]`}
                </button>
                <button className={`ptt-hardware-button ${isTalkingCh2 ? 'active' : ''}`} style={{height: '45px', fontSize: '14px', background: '#d35400', boxShadow: '0 3px 0 #a04000'}} type="button" onMouseDown={() => setIsTalkingCh2(true)} onMouseUp={() => setIsTalkingCh2(false)} onMouseLeave={() => setIsTalkingCh2(false)}>
                  {isTalkingCh2 ? "✦ 無線② 送話中 ✦" : `② 列車無線送信 [${pttKeyCh2}]`}
                </button>
                <button className={`ptt-hardware-button ${isTalkingCh3 ? 'active' : ''}`} style={{height: '45px', fontSize: '14px', background: '#2980b9', boxShadow: '0 3px 0 #1f618d'}} type="button" onMouseDown={() => setIsTalkingCh3(true)} onMouseUp={() => setIsTalkingCh3(false)} onMouseLeave={() => setIsTalkingCh3(false)}>
                  {isTalkingCh3 ? "✦ 無線③ 送話中 ✦" : `③ 連絡線送信 [${pttKeyCh3}]`}
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="cockpit-right-panel">
          {(!isConnected || selectedRole === 'dispatcher') && (
            <div className="right-panel-scroll-box" style={{display: 'flex', flexDirection: 'column', gap: '15px'}}>
              
              {selectedRole === 'driver' && (
                <div className="sub-panel-card">
                  <h3>🚊 {t.driverPanelTitle}</h3>
                  <p className="help-text">{t.driverInputHelp}</p>
                  <input type="text" className="freq-digit-input" value={inputFreq} readOnly placeholder="ch番号入力" />
                  
                  <div className="screen-num-keypad">
                    {[1,2,3,4,5,6,7,8,9,0,'修正'].map((n) => (
                      <button key={n} type="button" className={`btn-key-digit ${n === '修正' ? 'btn-key-clear' : ''}`} onClick={() => handleKeypadPress(n)}>{n}</button>
                    ))}
                  </div>
                  <button className="btn-action-primary" style={{marginTop: '15px'}} type="button" onClick={handleDriverConnect}>{t.btnConnect}</button>
                </div>
              )}

              {selectedRole === 'signal' && (
                <div className="sub-panel-card">
                  <h3>🚨 {t.signalPanelTitle} (Page {signalPage}/2)</h3>
                  <div className="signal-buttons-grid">
                    {signalPage === 1 ? (
                      signalStationsPage1.map(st => <button key={st} className="btn-station-select" type="button" onClick={() => handleSignalConnect(st)}>🚉 {st}</button>)
                    ) : (
                      signalStationsPage2.map(st => <button key={st} className="btn-station-select" type="button" onClick={() => handleSignalConnect(st)}>🚉 {st}</button>)
                    )}
                  </div>
                  <div className="pager-nav-bar">
                    <button className="btn-pager" disabled={signalPage === 1} type="button" onClick={() => setSignalPage(1)}>◀ Page 1</button>
                    <button className="btn-pager" disabled={signalPage === 2} type="button" onClick={() => setSignalPage(2)}>Page 2 ▶</button>
                  </div>
                </div>
              )}

              {selectedRole === 'dispatcher' && (
                <div className="sub-panel-card">
                  <h3>📞 指令無線 統制接続卓</h3>
                  <p className="help-text">指令専用本線波を開くか、テンキーで指定した運転台chへ介入します。</p>
                  
                  <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', alignItems: 'flex-start'}}>
                    <div>
                      <button className="btn-action-primary" style={{background: isConnected ? '#768390' : '#27ae60', boxShadow: isConnected ? '0 4px 0 #57606a' : '0 4px 0 #1e7e43'}} type="button" disabled={isConnected} onClick={handleDispatcherDedicatedConnect}>
                        {isConnected ? "📻 指令回線運用中" : "📻 指令無線一斉接続(111.000)"}
                      </button>
                      {isConnected && (
                        <div style={{marginTop: '15px', color: '#56d364', fontWeight: 'bold', fontSize: '14px', textAlign: 'center', background: 'rgba(86,211,100,0.1)', padding: '10px', borderRadius: '6px', border: '1px solid #238636'}}>
                          🟢 指令波・連絡波 回線開通中<br/>(モニター・通告送信可能)
                        </div>
                      )}
                    </div>
                    
                    <div style={{borderLeft: '1px solid #30363d', paddingLeft: '20px'}}>
                      <input type="text" className="freq-digit-input" style={{fontSize: '20px', padding: '8px', marginBottom: '10px'}} value={inputFreq} readOnly placeholder="ch選択" />
                      <div className="screen-num-keypad" style={{gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px'}}>
                        {[1,2,3,4,5,6,7,8,9,0,'修正'].map((n) => (
                          <button key={n} type="button" className="btn-key-digit" style={{padding: '8px 0', fontSize: '14px'}} onClick={() => handleKeypadPress(n)}>{n}</button>
                        ))}
                      </div>
                      <button className="btn-action-primary" style={{marginTop: '10px', padding: '10px', fontSize: '15px'}} type="button" onClick={handleDriverConnect}>指定ch割込接続</button>
                    </div>
                  </div>
                </div>
              )}

            </div>
          )}

          {isConnected && selectedRole !== 'dispatcher' && (
            <div className="sub-panel-card active-call-status">
              <p>🔊 現在、トリプルマルチ無線が同時開通しています。</p>
              <p style={{color: '#ff9800'}}>👉 各無線の受話ボリューム（ON/MUTE）は左液晶のトグルスイッチでカチカチ切り替えられます。</p>
              <p>キーボードの [{pttKeyCh1}]、[{pttKeyCh2}]、[{pttKeyCh3}] を使い分けることで、それぞれの無線へ狙って送話できます。</p>
            </div>
          )}

          {selectedRole === 'dispatcher' && (
            <div className="sub-panel-card" style={{marginTop: '0px'}}>
              <h3>📝 列車運行通告送信盤（常時操作可能）</h3>
              <p className="help-text">特定の列車番号、または「全員」に向けて着発変更通告テキストを一斉送信します。</p>
              <div style={{marginBottom: '8px'}}>
                <input 
                  type="text" 
                  style={{width: '100%', padding: '10px', background: '#010409', color: '#fff', border: '1px solid #30363d', borderRadius: '4px', fontSize: '15px'}} 
                  value={dispatchTarget} 
                  onFocus={() => setIsTyping(true)}
                  onBlur={() => setIsTyping(false)}
                  onChange={(e) => setDispatchTarget(e.target.value)} 
                  placeholder="送信先を入力 (例: 1021M、または 全員)"
                />
              </div>
              <div>
                <textarea 
                  style={{width: '100%', height: '55px', padding: '10px', background: '#010409', color: '#fff', border: '1px solid #30363d', borderRadius: '4px', resize: 'none', fontFamily:'monospace', fontSize: '15px'}} 
                  value={dispatchMessage} 
                  onFocus={() => setIsTyping(true)}
                  onBlur={() => setIsTyping(false)}
                  onChange={(e) => setDispatchMessage(e.target.value)} 
                  placeholder="通告内容（例: 館浜駅3番線着発に変更到着後指令連絡）"
                />
              </div>
              <button className="btn-action-primary" style={{marginTop: '8px', padding: '10px', background: '#da5b0b', boxShadow: '0 4px 0 #9e3f03'}} type="button" onClick={handleSendNotice}>
                ⚡ 通告呼出・一斉送信 ⚡
              </button>
            </div>
          )}

          <div className="dispatcher-monitor-board" style={{marginTop: '0px'}}>
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
        <button className="btn-logout-clear-mini" type="button" onClick={handleClearAllStorage}>{t.btnClearAuth}</button>
      </div>
    </div>
  );
}

export default App;