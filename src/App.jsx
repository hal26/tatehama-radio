import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';

// ⚠️ ご指定のRender URLを固定
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
    home: "🏠 ログアウト・ホーム",
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

  // ログイン・認証管理
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userName, setUserName] = useState(() => localStorage.getItem('tatehama_crew_name') || '');
  const [selectedRole, setSelectedRole] = useState('driver'); // driver, signal, dispatcher
  const [authCode, setAuthCode] = useState(''); // 入力された8桁コード
  const [isAdminUnlocked, setIsAdminUnlocked] = useState(false); // アドミンコード成功で全職種解放フラグ

  // 無線機内部データ
  const [inputFreq, setInputFreq] = useState('1');
  const [currentDisplayLabel, setCurrentDisplayLabel] = useState('---');
  const [currentRawFreq, setCurrentRawFreq] = useState('');
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
      setCurrentRawFreq(frequency);
      setCurrentDisplayLabel(displayLabel);
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

  // 🔑 暗証番号コード入力判定付きログイン処理
  const handleLoginSubmit = () => {
    if (!userName.trim()) {
      alert("乗務員名を入力してください。");
      return;
    }

    const trimmedCode = authCode.trim();

    // 1. アドミンメニュー解放コード判定
    if (trimmedCode === '88888888') {
      setIsAdminUnlocked(true);
      alert("🔓 管理者認証成功：全職種選択ボタンが解放されました。");
      setAuthCode(''); // 入力欄をクリア
      return; // ログインはせず、メニュー選択状態へ
    }

    // 2. アドミン解放モードですでにボタンを選んでいる場合は、選択中のロールでそのままログイン
    if (isAdminUnlocked) {
      localStorage.setItem('tatehama_crew_name', userName);
      setIsLoggedIn(true);
      socket.emit('user-login', { name: userName, role: selectedRole });
      return;
    }

    // 3. 通常コードによる直接裏ルートログイン判定
    let finalRole = 'driver'; // デフォルトは運転士

    if (trimmedCode === '22223333') {
      finalRole = 'signal';
      alert("🚨 信号係として認証されました。");
    } else if (trimmedCode === '44445555') {
      finalRole = 'dispatcher';
      alert("📞 運転指令員として認証されました。");
    } else if (trimmedCode !== '') {
      alert("❌ 認証コードが正しくありません。");
      return;
    } else {
      // コードが空欄の場合は通常通り「運転士」としてログイン
      finalRole = 'driver';
    }

    localStorage.setItem('tatehama_crew_name', userName);
    setSelectedRole(finalRole);
    setIsLoggedIn(true);
    socket.emit('user-login', { name: userName, role: finalRole });
  };

  const handleGoHome = () => {
    handleDisconnect();
    stopEmergencyBeep();
    setReceivedNotice(null);
    setIsLoggedIn(false);
    setIsAdminUnlocked(false); // ホームに戻ったらアドミン解放状態もリセット
    setAuthCode('');
    setSelectedRole('driver');
  };

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

  const handleDispatcherDedicatedConnect = () => {
    socket.emit('join-frequency', { frequency: '111.000', displayLabel: '指令専用無線 (111.000 MHz)' });
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

  // 🛑 ログイン画面（認証コード対応）
  if (!isLoggedIn) {
    return (
      <div className={`app-container theme-${theme} login-screen-wrapper`}>
        <h2>{t.loginTitle}</h2>
        
        {/* 乗務員名入力 */}
        <input 
          type="text" 
          className="crew-name-input" 
          value={userName} 
          onChange={(e) => setUserName(e.target.value)} 
          placeholder={t.namePlaceholder}
        />

        {/* メイン選択エリア */}
        <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '25px', width: '100%', alignItems: 'center'}}>
          
          {/* 左側：職種ボタンエリア */}
          <div className="role-grid" style={{gridTemplateColumns: isAdminUnlocked ? '1fr' : '1fr', gap: '15px'}}>
            {!isAdminUnlocked ? (
              // 🚊 通常時は「運転士」ボタンだけを表示
              <button className="role-select-card active" style={{height: '110px', fontSize: '20px'}}>
                🚊<br/>{t.driver} (常時選択可能)
              </button>
            ) : (
              // 🔓 アドミン解除時は「全職種が選べるメニュー」が出現！
              <div style={{display: 'flex', flexDirection: 'column', gap: '10px'}}>
                <div style={{color: '#56d364', fontSize: '14px', fontWeight: 'bold', textAlign: 'center', marginBottom: '5px'}}>🔓 ADMIN FULL ACCESS UNLOCKED</div>
                <button className={`role-select-card ${selectedRole === 'driver' ? 'active' : ''}`} style={{height: '55px', fontSize: '15px'}} onClick={() => setSelectedRole('driver')}>🚊 {t.driver}</button>
                <button className={`role-select-card ${selectedRole === 'signal' ? 'active' : ''}`} style={{height: '55px', fontSize: '15px'}} onClick={() => setSelectedRole('signal')}>🚨 {t.signal}</button>
                <button className={`role-select-card ${selectedRole === 'dispatcher' ? 'active' : ''}`} style={{height: '55px', fontSize: '15px'}} onClick={() => setSelectedRole('dispatcher')}>📞 {t.dispatcher}</button>
              </div>
            )}
          </div>

          {/* 右側：暗証番号入力エリア */}
          <div style={{display: 'flex', flexDirection: 'column', gap: '10px'}}>
            <label style={{fontSize: '14px', color: '#8b949e', fontWeight: 'bold'}}>🔒 信号・指令・アドミン用認証コード</label>
            <input 
              type="password" 
              className="crew-name-input" 
              style={{fontSize: '22px', padding: '15px', letterSpacing: '4px'}}
              value={authCode} 
              disabled={isAdminUnlocked} // アドミン解放後はロック
              onChange={(e) => setAuthCode(e.target.value.replace(/[^0-9]/g, ''))} // 数字のみ
              placeholder={isAdminUnlocked ? "認証完了" : t.codePlaceholder}
              maxLength={8}
            />
            <span style={{fontSize: '11px', color: '#768390'}}>※運転士として乗務する場合は空欄のままで構いません。</span>
          </div>

        </div>

        <button className="btn-action-primary start-duty-btn" onClick={handleLoginSubmit}>
          {isAdminUnlocked ? "選択した職種で乗務開始" : t.btnLogin}
        </button>
      </div>
    );
  }

  // 無線機メイン画面（変更なし・全職種配置モニター完備）
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
              <p>🔊 現在、通信回線が開通しています。</p>
              <p>左側のPTTスイッチ、またはキーボードの [{pttKey}] を押しながら交信してください。</p>
            </div>
          )}

          {/* 🖥️ 全社員共通モニター盤 */}
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