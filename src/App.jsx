import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';

const socket = io('https://tatehama-radio.onrender.com');

// 🚀 保安対策：運転士モードの時は信号所VC・カスタム周波数への接続を完全に禁止！
const APP_VERSION = "v3.1.3";

const languages = {
  ja: {
    title: "館浜電鉄 運行管理無線システム",
    statusLabel: "STATUS:",
    standby: "STANDBY (未接続)",
    online: "ONLINE (2波同時受令中)", // 運転士は2波（列車・指令連絡）
    onlineDisp: "ONLINE (指令統制モード)",
    membersLabel: "MEMBERS:",
    signalLabel: "SIGNAL:",
    roleLabel: "ROLE:",
    userLabel: "NAME:",
    btnConnect: "指定ch 接続開始",
    btnDisconnect: "全回線切断",
    settings: "設定",
    home: "🏠 職種選択に戻る",
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
    driverPanelTitle: "🚊 運転台列車無線 チャンネル設定",
    driverInputHelp: "乗務する路線の「ch番号」を入力して接続します。※安全のため、信号所VCや指令専用波への割込はロックされています。",
    signalPanelTitle: "🚨 信号所VC 3ch同時受令選択",
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

  // エラー表示用の状態（脱ポップアップ）
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

  // 🔊 独立受話ミュート
  const [muteCh1, setMuteCh1] = useState(false);
  const [muteCh2, setMuteCh2] = useState(false);
  const [muteCh3, setMuteCh3] = useState(false);

  // 🎤 独立PTT送信
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

  // タイピング判定
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

  // キーボードイベント
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
        // 運転士のときは無線3の連絡波への送信キーを無効化
        if (e.code === pttKeyCh2) { e.preventDefault(); setIsTalkingCh2(true); }
        if (e.code === pttKeyCh3 && selectedRole !== 'driver') { e.preventDefault(); setIsTalkingCh3(true); }
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
  }, [isLoggedIn, isConnected, pttKeyCh1, pttKeyCh2, pttKeyCh3, activeCaptureCh, showSettings, isTyping, selectedRole]);

  // 認証ログイン
  const handleLoginSubmit = () => {
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

  // 🚊 運転士接続 (保安：1〜80ch以外は弾く)
  const handleDriverConnect = () => {
    const chNum = parseInt(inputFreq.trim(), 10);
    
    if (isNaN(chNum) || chNum < 1 || chNum > 80) {
      setCodeError("❌ 運転士無線は1ch〜80chの範囲で指定してください。");
      return;
    }

    const calcOffset = 100 + chNum;
    const targetFreq = `111.${calcOffset}`;
    const mainLabel = `${chNum}ch 列車無線本線波 (${targetFreq} MHz)`;

    socket.emit('join-frequency', { 
      frequency: targetFreq, 
      displayLabel: `🚊 ${chNum}ch列車無線` 
    });

    setCh1Label(mainLabel);
    setCh2Label("111.000 MHz (全線列車無線共通波 - 受話のみ)");
    setCh3Label("非開通 (信号指令連絡波 - 運転士アクセス禁止)");
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
    setCh3Label('統制指令管理セクション');
    setIsConnected(true);
  };

  // 🚨 信号係接続
  const handleSignalConnect = (stationName) => {
    const freqCode = `sig_${stationName}`;
    const mainLabel = `信号所内連絡VC [${stationName}駅]`;

    socket.emit('join-frequency', { 
      frequency: freqCode, 
      displayLabel: `信号:${stationName} + 📻列車` 
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
      if (inputFreq.length < 2) { // 2桁(80chまで)に制限
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
    // ログイン画面 (前回と同じため割愛せずそのまま維持)
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
              <label className="field-lbl">🔒 特務認証コード（保存されます）</label>
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
                <span style={{fontSize: '13px', fontWeight: 'bold', color: '#f9826c'}}>⌨️ PTT送信キー割り当て</span>
                
                <label style={{marginTop: '8px'}}>無線① PTTキー (本線/MAIN)</label>
                <button type="button" className={`btn-keybind-capture ${activeCaptureCh === 1 ? 'capturing' : ''}`} onClick={() => setActiveCaptureCh(1)}>
                  {activeCaptureCh === 1 ? "任意のキーを押してください..." : pttKeyCh1}
                </button>

                <label style={{marginTop: '8px'}}>無線② PTTキー (共通通報受令波)</label>
                <button type="button" className={`btn-keybind-capture ${activeCaptureCh === 2 ? 'capturing' : ''}`} onClick={() => setActiveCaptureCh(2)}>
                  {activeCaptureCh === 2 ? "任意のキーを押してください..." : pttKeyCh2}
                </button>

                {selectedRole !== 'driver' && (
                  <>
                    <label style={{marginTop: '8px'}}>無線③ PTTキー (信号指令連絡波)</label>
                    <button type="button" className={`btn-keybind-capture ${activeCaptureCh === 3 ? 'capturing' : ''}`} onClick={() => setActiveCaptureCh(3)}>
                      {activeCaptureCh === 3 ? "任意のキーを押してください..." : pttKeyCh3}
                    </button>
                  </>
                )}
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
            <div className="lcd-line"><span className="lcd-lbl">{t.statusLabel}</span><span className={`lcd-val ${isConnected ? 'on' : 'off'}`}>{isConnected ? (selectedRole === 'dispatcher' ? t.onlineDisp : t.online) : t.standby}</span></div>
            <div className="lcd-line"><span className="lcd-lbl">{t.userLabel}</span><span className={`lcd-val highlights`}>{userName}</span></div>
            <div className="lcd-line"><span className="lcd-lbl">{t.roleLabel}</span><span className="lcd-val role-name-color-lcd">{getRoleText(selectedRole)}</span></div>
            
            <div>
              <div className="lcd-line" style={{border: 'none'}}><span className="lcd-lbl">📡 無線① [MAIN CH]:</span></div>
              <div className="lcd-line" style={{border: 'none', alignItems: 'center'}}>
                <span className="lcd-val val-mainch" style={{fontSize: '15px', color: muteCh1 ? '#768390' : '#39d353'}}>{muteCh1 ? "--- (MUTE中)" : ch1Label}</span>
                <button type="button" onClick={() => setMuteCh1(!muteCh1)} style={{padding: '3px 8px', fontSize: '11px', background: muteCh1 ? '#c0392b' : '#27ae60', color: '#fff', border: 'none', borderRadius: '4px'}}>
                  {muteCh1 ? "🔇 MUTE" : "🔊 ON"}
                </button>
              </div>
              <div className="lcd-line" style={{fontSize: '11px', color: '#8b949e'}}>PTTキー: [{pttKeyCh1}] {isTalkingCh1 && <span style={{color: '#ff9800', fontWeight: 'bold'}}>【TX中】</span>}</div>
            </div>

            <div style={{borderTop: '1px dashed #30363d', paddingTop: '5px'}}>
              <div className="lcd-line" style={{border: 'none'}}><span className="lcd-lbl" style={{color: '#ff9800'}}>📻 無線② [列車無線共通波]:</span></div>
              <div className="lcd-line" style={{border: 'none', alignItems: 'center'}}>
                <span className="lcd-val" style={{fontSize: '14px', color: muteCh2 ? '#768390' : '#ffb74d'}}>{muteCh2 ? "--- (MUTE中)" : ch2Label}</span>
                <button type="button" onClick={() => setMuteCh2(!muteCh2)} style={{padding: '3px 8px', fontSize: '11px', background: muteCh2 ? '#c0392b' : '#27ae60', color: '#fff', border: 'none', borderRadius: '4px'}}>
                  {muteCh2 ? "🔇 MUTE" : "🔊 ON"}
                </button>
              </div>
              <div className="lcd-line" style={{fontSize: '11px', color: '#8b949e'}}>PTTキー: [{pttKeyCh2}] {isTalkingCh2 && <span style={{color: '#ff9800', fontWeight: 'bold'}}>【TX中】</span>}</div>
            </div>

            {/* 🎯 保安：運転士の場合は、無線3（指令信号連絡波）の表示枠そのものを隠すかアクセス不可にする */}
            {selectedRole !== 'driver' ? (
              <div style={{borderTop: '1px dashed #30363d', paddingTop: '5px'}}>
                <div className="lcd-line" style={{border: 'none'}}><span className="lcd-lbl" style={{color: '#00d2ff'}}>📡 無線③ [信号指令連絡波]:</span></div>
                <div className="lcd-line" style={{border: 'none', alignItems: 'center'}}>
                  <span className="lcd-val" style={{fontSize: '14px', color: muteCh3 ? '#768390' : '#88d8ff'}}>{muteCh3 ? "--- (MUTE中)" : ch3Label}</span>
                  <button type="button" onClick={() => setMuteCh3(!muteCh3)} style={{padding: '3px 8px', fontSize: '11px', background: muteCh3 ? '#c0392b' : '#27ae60', color: '#fff', border: 'none', borderRadius: '4px'}}>
                    {muteCh3 ? "🔇 MUTE" : "🔊 ON"}
                  </button>
                </div>
                <div className="lcd-line" style={{fontSize: '11px', color: '#8b949e'}}>PTTキー: [{pttKeyCh3}] {isTalkingCh3 && <span style={{color: '#ff9800', fontWeight: 'bold'}}>【TX中】</span>}</div>
              </div>
            ) : (
              <div style={{borderTop: '1px dashed #30363d', paddingTop: '5px', color: '#6e7681', fontSize: '11px', textAlign: 'center', padding: '6px 0'}}>
                🔒 信号指令連絡波(無線③)は運転士アカウント制限中です
              </div>
            )}

            <div className="lcd-line" style={{borderTop: '2px solid #30363d', paddingTop: '5px'}}><span className="lcd-lbl">{t.membersLabel}</span><span className="lcd-val green-lcd-text" style={{fontSize: '16px'}}>{isConnected ? `${connectedCount} / 5 名` : '---'}</span></div>
          </div>

          {isConnected && (
            <div className="in-call-controls">
              <button onClick={handleDisconnect} className="btn-cockpit danger" type="button">
                {t.btnDisconnect}
              </button>
              
              <div style={{display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '5px'}}>
                <button className={`ptt-hardware-button ${isTalkingCh1 ? 'active' : ''}`} style={{height: '45px', fontSize: '14px', boxShadow: '0 3px 0 #9e3f03'}} type="button" onMouseDown={() => setIsTalkingCh1(true)} onMouseUp={() => setIsTalkingCh1(false)}>
                  {isTalkingCh1 ? "✦ 無線① 送話中 ✦" : `① 列車本線送信 [${pttKeyCh1}]`}
                </button>
                <button className={`ptt-hardware-button ${isTalkingCh2 ? 'active' : ''}`} style={{height: '45px', fontSize: '14px', background: '#d35400', boxShadow: '0 3px 0 #a04000'}} type="button" onMouseDown={() => setIsTalkingCh2(true)} onMouseUp={() => setIsTalkingCh2(false)}>
                  {isTalkingCh2 ? "✦ 無線② 送話中 ✦" : `② 共通波送信 [${pttKeyCh2}]`}
                </button>
                {/* 運転士はボタン自体を押せなくする */}
                {selectedRole !== 'driver' && (
                  <button className={`ptt-hardware-button ${isTalkingCh3 ? 'active' : ''}`} style={{height: '45px', fontSize: '14px', background: '#2980b9', boxShadow: '0 3px 0 #1f618d'}} type="button" onMouseDown={() => setIsTalkingCh3(true)} onMouseUp={() => setIsTalkingCh3(false)}>
                    {isTalkingCh3 ? "✦ 無線③ 送話中 ✦" : `③ 連絡線送信 [${pttKeyCh3}]`}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="cockpit-right-panel">
          {(!isConnected || selectedRole === 'dispatcher') && (
            <div className="right-panel-scroll-box" style={{display: 'flex', flexDirection: 'column', gap: '15px'}}>
              
              {/* 🚊 運転士専用パネル（1〜80の指定chにしか接続できないテンキー式） */}
              {selectedRole === 'driver' && (
                <div className="sub-panel-card">
                  <h3>{t.driverPanelTitle}</h3>
                  <p className="help-text">{t.driverInputHelp}</p>
                  {codeError && <div style={{color: '#ff7b72', fontSize: '13px', fontWeight: 'bold', marginBottom: '8px'}}>{codeError}</div>}
                  <input type="text" className="freq-digit-input" value={inputFreq} readOnly placeholder="ch番号" style={{textAlign: 'center', fontSize: '24px', letterSpacing: '4px'}} />
                  
                  <div className="screen-num-keypad" style={{maxWidth: '280px', margin: '12px auto'}}>
                    {[1,2,3,4,5,6,7,8,9,0,'修正'].map((n) => (
                      <button key={n} type="button" className={`btn-key-digit ${n === '修正' ? 'btn-key-clear' : ''}`} onClick={() => { handleKeypadPress(n); setCodeError(''); }}>{n}</button>
                    ))}
                  </div>
                  <button className="btn-action-primary" style={{marginTop: '5px', background: '#1f618d', boxShadow: '0 4px 0 #154360'}} type="button" onClick={handleDriverConnect}>
                    指定された本線チャンネルに入線 (接続)
                  </button>
                </div>
              )}

              {/* 🚨 信号係専用パネル（運転士画面には絶対に出現しない） */}
              {selectedRole === 'signal' && (
                <div className="sub-panel-card">
                  <h3>{t.signalPanelTitle} (Page {signalPage}/2)</h3>
                  <div className="signal-buttons-grid">
                    {signalPage === 1 ? (
                      signalStationsPage1.map(st => <button key={st} className="btn-station-select" type="button" onClick={() => handleSignalConnect(st)}>🚉 {st}駅VC</button>)
                    ) : (
                      signalStationsPage2.map(st => <button key={st} className="btn-station-select" type="button" onClick={() => handleSignalConnect(st)}>🚉 {st}駅VC</button>)
                    )}
                  </div>
                  <div className="pager-nav-bar">
                    <button className="btn-pager" disabled={signalPage === 1} type="button" onClick={() => setSignalPage(1)}>◀ Page 1</button>
                    <button className="btn-pager" disabled={signalPage === 2} type="button" onClick={() => setSignalPage(2)}>Page 2 ▶</button>
                  </div>
                </div>
              )}

              {/* 📞 指令員専用パネル */}
              {selectedRole === 'dispatcher' && (
                <div className="sub-panel-card">
                  <h3>📞 指令無線 統制接続卓</h3>
                  <p className="help-text">指令専用本線波を開くか、テンキーで指定した運転台chへ介入します。</p>
                  
                  <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', alignItems: 'flex-start'}}>
                    <div>
                      <button className="btn-action-primary" style={{background: isConnected ? '#768390' : '#27ae60', boxShadow: isConnected ? '0 4px 0 #57606a' : '0 4px 0 #1e7e43'}} type="button" disabled={isConnected} onClick={handleDispatcherDedicatedConnect}>
                        {isConnected ? "📻 指令回線運用中" : "📻 指令無線一斉接続(111.000)"}
                      </button>
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
              <p>🟢 現在、指定された正規の運行無線回線が開通しています。</p>
              <p style={{color: '#ff9800', fontSize: '12px'}}>👉 規程に基づき、PTTキーを使用して正しく交信を行ってください。</p>
            </div>
          )}

          {/* 指令通告盤 (指令員のみ表示) */}
          {selectedRole === 'dispatcher' && (
            <div className="sub-panel-card" style={{marginTop: '0px'}}>
              <h3>📝 列車運行通告送信盤</h3>
              <div style={{marginBottom: '8px'}}>
                <input 
                  type="text" 
                  style={{width: '100%', padding: '10px', background: '#010409', color: '#fff', border: '1px solid #30363d', borderRadius: '4px'}} 
                  value={dispatchTarget} 
                  onFocus={() => setIsTyping(true)}
                  onBlur={() => setIsTyping(false)}
                  onChange={(e) => setDispatchTarget(e.target.value)} 
                  placeholder="送信先を入力 (例: 1021M、または 全員)"
                />
              </div>
              <div>
                <textarea 
                  style={{width: '100%', height: '55px', padding: '10px', background: '#010409', color: '#fff', border: '1px solid #30363d', borderRadius: '4px', resize: 'none'}} 
                  value={dispatchMessage} 
                  onFocus={() => setIsTyping(true)}
                  onBlur={() => setIsTyping(false)}
                  onChange={(e) => setDispatchMessage(e.target.value)} 
                  placeholder="通告内容"
                />
              </div>
              <button className="btn-action-primary" style={{marginTop: '8px', padding: '10px', background: '#da5b0b', boxShadow: '0 4px 0 #9e3f03'}} type="button" onClick={handleSendNotice}>
                ⚡ 通告呼出・一斉送信 ⚡
              </button>
            </div>
          )}

          {/* 社員配置モニター盤 */}
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