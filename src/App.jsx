import React, { useState, useEffect } from 'react';
import { io } from 'socket.io-client';

// ⚠️ ご指定のRender URLを固定で埋め込み済みです
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
    btnMuteOn: "マイク消音",
    btnMuteOff: "マイクON",
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
    adminPanelTitle: "⚠️ 指令員専用 遠隔統制コンソール",
    kickBtn: "当該ch全員強制切断",
    muteBtn: "当該ch全員強制消音",
    blockBtn: "当該ch全員アクセス拒否",
    loginTitle: "乗務員登録 ＆ 職種選択",
    namePlaceholder: "乗務員名を入力してください",
    driver: "運転士",
    signal: "信号係",
    dispatcher: "運転指令員",
    btnLogin: "乗務開始",
    driverPanelTitle: "運転台無線チャンネル設定",
    driverInputHelp: "無線ch入力 (1～80) または直接周波数入力",
    signalPanelTitle: "信号所・検車区 VC選択",
    dispPanelTitle: "無線通信・配置モニター盤"
  },
  en: {
    title: "Tatehama Railway Control Communication System",
    statusLabel: "STATUS:",
    standby: "STANDBY (DISCONNECTED)",
    online: "ONLINE (CONNECTED)",
    freqLabel: "FREQ/LOC:",
    membersLabel: "MEMBERS:",
    signalLabel: "SIGNAL:",
    roleLabel: "ROLE:",
    userLabel: "NAME:",
    tx: "■ TX (TRANSMITTING)",
    rx: "□ RX (LISTENING)",
    inputLabel: "Frequency (Up to 6 digits)",
    btnConnect: "CONNECT",
    btnMuteOn: "MUTE MIC",
    btnMuteOff: "UNMUTE MIC",
    btnDisconnect: "DISCONNECT",
    pttReady: "● PUSH TO TALK (PTT)",
    pttActive: "✦ TRANSMITTING (PTT ON) ✦",
    settings: "Settings",
    home: "🏠 HOME",
    langSelect: "Language Select",
    themeSelect: "Screen Theme",
    themeDark: "Dark",
    themeLight: "Light",
    keybindLabel: "PTT Keybind",
    adminPanelTitle: "⚠️ Dispatcher Remote Control Console",
    kickBtn: "FORCE KICK CH",
    muteBtn: "FORCE MUTE CH",
    blockBtn: "BLOCK CH USERS",
    loginTitle: "Crew Login & Role Select",
    namePlaceholder: "Enter your name...",
    driver: "Driver",
    signal: "Signalman",
    dispatcher: "Dispatcher",
    btnLogin: "START DUTY",
    driverPanelTitle: "Cab Radio Channel Configuration",
    driverInputHelp: "Enter ch (1-80) or raw frequency",
    signalPanelTitle: "Signal Box VC Select",
    dispPanelTitle: "Radio Traffic & Allocation Monitor"
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
  const [isMuted, setIsMuted] = useState(false);
  const [isTalking, setIsTalking] = useState(false);
  const [connectedCount, setConnectedCount] = useState(0);

  const [signalPage, setSignalPage] = useState(1);
  const [monitorData, setMonitorData] = useState([]);

  const [showSettings, setShowSettings] = useState(false);
  const [pttKey, setPttKey] = useState('Space');
  const [isListeningKey, setIsListeningKey] = useState(false);

  useEffect(() => {
    socket.on('room-count-update', (count) => setConnectedCount(count));
    socket.on('dispatcher-monitor-data', (data) => setMonitorData(data));

    socket.on('join-failed', (msg) => {
      alert(`⚠️ 接続エラー: ${msg}`);
      setIsConnected(false);
    });

    socket.on('join-success', ({ frequency, displayLabel }) => {
      setCurrentRawFreq(frequency);
      setCurrentDisplayLabel(displayLabel);
      setIsConnected(true);
    });

    return () => {
      socket.off('room-count-update');
      socket.off('dispatcher-monitor-data');
      socket.off('join-failed');
      socket.off('join-success');
    };
  }, []);

  useEffect(() => {
    socket.on('admin-force-disconnect', () => {
      handleDisconnect();
      alert(lang === 'ja' ? "⚠️ 指令権限により強制切断されました。" : "⚠️ Disconnected by dispatcher command.");
    });
    socket.on('admin-force-mute', () => {
      setIsMuted(true);
      alert(lang === 'ja' ? "⚠️ 指令権限によりマイクが強制消音されました。" : "⚠️ Muted by dispatcher command.");
    });
    return () => {
      socket.off('admin-force-disconnect');
      socket.off('admin-force-mute');
    };
  }, [lang]);

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
    setIsLoggedIn(false);
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

  const handleDispatcherControl = (actionType, rawFreq) => {
    if (!rawFreq) return;
    socket.emit('admin-command', { action: actionType, freq: rawFreq });
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

      {showSettings && (
        <div className="settings-overlay">
          <div className="settings-box">
            <h3>⚙️ {t.settings}</h3>
            <hr />
            <label>{t.langSelect}</label>
            <select value={lang} onChange={(e) => setLang(e.target.value)} className="lang-select">
              <option value="ja">日本語 (Japanese)</option>
              <option value="en">English</option>
            </select>
            <label>{t.themeSelect}</label>
            <select value={theme} onChange={(e) => setTheme(e.target.value)} className="lang-select">
              <option value="dark">{t.themeDark}</option>
              <option value="light">{t.themeLight}</option>
            </select>
            <label>{t.keybindLabel}</label>
            <button className={`btn-keybind-capture ${isListeningKey ? 'capturing' : ''}`} onClick={() => setIsListeningKey(true)}>
              {isListeningKey ? "Press any key..." : pttKey}
            </button>
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
                <button onClick={() => setIsMuted(!isMuted)} className={`btn-cockpit ${isMuted ? 'muted' : ''}`}>{isMuted ? t.btnMuteOff : t.btnMuteOn}</button>
                <button onClick={handleDisconnect} className="btn-cockpit danger">{t.btnDisconnect}</button>
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
            <>
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
                <div className="sub-panel-card">
                  <h3>📞 指令無線 ch接続</h3>
                  <p className="help-text">特定のch番号(1〜80)や周波数を入力して緊急介入できます。</p>
                  <input type="text" className="freq-digit-input" value={inputFreq} onChange={(e) => setInputFreq(e.target.value)} placeholder="ch番号 または 周波数" />
                  <button className="btn-action-primary" onClick={handleDriverConnect}>指定VCへ緊急介入</button>
                </div>
              )}
            </>
          ) : (
            <div className="sub-panel-card active-call-status">
              <p>🔊 現在、通信回線が開通しています。</p>
              <p>左側のPTTスイッチ、またはキーボードの [{pttKey}] を押しながら交信してください。</p>
            </div>
          )}

          {selectedRole === 'dispatcher' && (
            <div className="dispatcher-monitor-board">
              <h3>🖥️ {t.dispPanelTitle}</h3>
              <div className="monitor-table-container">
                <table className="monitor-table">
                  <thead>
                    <tr>
                      <th>乗務員名</th>
                      <th>職種</th>
                      <th>現在位置 (接続VC)</th>
                      <th>統制指令</th>
                    </tr>
                  </thead>
                  <tbody>
                    {monitorData.map((user) => (
                      <tr key={user.id}>
                        <td>{user.name}</td>
                        <td><span className={`badge role-${user.role}`}>{getRoleText(user.role)}</span></td>
                        <td className="loc-text">{user.location}</td>
                        <td>
                          {user.location !== '未接続' && (
                            <div className="td-admin-actions">
                              <button className="mini-admin-btn kick" onClick={() => handleDispatcherControl('KICK', user.frequency)}>切断</button>
                              <button className="mini-admin-btn mute" onClick={() => handleDispatcherControl('MUTE', user.frequency)}>消音</button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                    {monitorData.length === 0 && <tr><td colSpan="4" style={{textAlign:'center', color:'#666'}}>乗務中の社員はいません</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;